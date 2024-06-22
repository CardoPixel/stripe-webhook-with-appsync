import * as fs from "fs";
import * as path from "path";
import * as cdk from 'aws-cdk-lib';
import {
  aws_appsync as appsync,
  aws_iam as iam,
  aws_lambda as lambda,
  CfnOutput,
  RemovalPolicy,
  Tags
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class StripeWebhookWithAppsyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appName = "StripeWebhookWithAppsync";

    // Dynamically applying tags to all resources in this stack
    Tags.of(this).add("App", appName);

    const swwaLogRole = new iam.Role(this, "SWWALogRole", {
      assumedBy: new iam.ServicePrincipal("appsync.amazonaws.com"),
      description: "Allows AppSync to write logs to CloudWatch",
    });

    swwaLogRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
      })
    );

    // Create the AppSync API
    const api = new appsync.CfnGraphQLApi(this, "SWWAAPI", {
      name: "SWWAAPI",
      authenticationType: "API_KEY",
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
        cloudWatchLogsRoleArn: swwaLogRole.roleArn,
        excludeVerboseContent: false,
      },
    });

    const graphqlSchema = fs.readFileSync(
      path.join(__dirname, "../graphql/schema.graphql"),
      { encoding: "utf-8" }
    );

    new appsync.CfnGraphQLSchema(this, "SWWAAPISchema", {
      apiId: api.attrApiId,
      definition: graphqlSchema,
    });

    const expiryTimeInSeconds = Math.floor(
      Date.now() / 1000 + 365 * 24 * 60 * 60
    ); // 1 year

    const apiKey = new appsync.CfnApiKey(this, "SWWAAPIAPIKey", {
      apiId: api.attrApiId,
      expires: expiryTimeInSeconds,
    });

    const webhookFunction = new lambda.Function(this, 'WebhookFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'webhook.handler',
      code: lambda.Code.fromAsset('lambda'),
    });

    const lambdaInvokeRole = new iam.Role(this, "LambdaInvokeRole", {
      assumedBy: new iam.ServicePrincipal("appsync.amazonaws.com"),
      description: "Allows AppSync to invoke Lambda functions",
    });

    lambdaInvokeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [`arn:aws:lambda:${this.region}:${this.account}:function:*`],
        actions: ["lambda:InvokeFunction"],
      })
    );

    const lambdaDataSource = new appsync.CfnDataSource(this, 'LambdaDataSource', {
      apiId: api.attrApiId,
      name: 'LambdaDataSource',
      type: 'AWS_LAMBDA',
      lambdaConfig: {
        lambdaFunctionArn: webhookFunction.functionArn,
      },
      serviceRoleArn: lambdaInvokeRole.roleArn,
    });

    const webhookResolver = new appsync.CfnResolver(this, 'getWebhookResolver', {
      apiId: api.attrApiId,
      typeName: 'Mutation',
      fieldName: 'getWebhook',
      dataSourceName: lambdaDataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "Invoke",
        "payload": {
          "arguments": $util.toJson($context.arguments)
        }
      }`,
      responseMappingTemplate: "$util.toJson($context.result)",
    });
    webhookResolver.addDependency(lambdaDataSource);

    new CfnOutput(this, 'GraphQLAPIURL', {
      value: api.attrGraphQlUrl,
      description: 'The URL of the GraphQL API',
    });

    new CfnOutput(this, 'GraphQLAPIKey', {
      value: apiKey.attrApiKey,
      description: 'The API Key for the GraphQL API',
    });
  }
}
