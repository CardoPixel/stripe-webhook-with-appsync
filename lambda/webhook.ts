// ---------- 1. Imports ----------
import { Logger } from "@aws-lambda-powertools/logger";
import Stripe from 'stripe';

// ---------- 2. Constants ----------
const logger = new Logger({
    serviceName: "stripe",
    logLevel: "debug",
});

// ---------- 5. Handler Main Code block ----------
export const handler = async (event: any): Promise<{ statusCode: number, body: string }> => {
    logger.info(`🎫 Raw Event: ${event}`);
    let eventData;
    try {
        eventData = JSON.parse(event.body)?.data?.object;
        logger.info('✅ Webhook received successfully!. Data: ${eventData}');
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `✅ Webhook received successfully!. Data: ${eventData}` }),
        };
    } catch (error) {
        logger.error(`❌ Error parsing event data: ${error}`);
        return {
            statusCode: 400,
            body: JSON.stringify({ message: `❌ Error parsing event data: ${error}` }),
        };
    }
};