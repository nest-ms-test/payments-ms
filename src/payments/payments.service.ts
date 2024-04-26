import { Request, Response } from 'express';
import { Injectable } from '@nestjs/common';
import { envs } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.STRIPE_SECRET_KEY);

  async createPaymentSession(paymentsSessioDto: PaymentSessionDto) {
    const { orderId, currency, items } = paymentsSessioDto;

    const lineItems = items.map((item) => ({
      price_data: {
        currency,
        product_data: {
          name: item.name,
        },
        unit_amount: item.price * 100,
      },
      quantity: item.quantity,
    }));

    const session = await this.stripe.checkout.sessions.create({
      payment_intent_data: {
        metadata: {
          orderId,
        },
      },
      line_items: lineItems,
      mode: 'payment',
      success_url: envs.SUCCESS_URL,
      cancel_url: envs.CANCEL_URL,
    });

    return session;
  }

  async stripeWebhook(request: Request, response: Response) {
    const sig = request.headers['stripe-signature'];

    let event: Stripe.Event;

    const endpointSecret = envs.STRIPE_WEBHOOK_SECRET;

    try {
      event = this.stripe.webhooks.constructEvent(
        request['rawBody'],
        sig,
        endpointSecret,
      );
    } catch (error) {
      response.status(400).send(`Webhook Error: ${error.message}`);
      return;
    }

    if (event.type === 'charge.succeeded') {
      const chargeSuccessEvent = event.data.object as Stripe.Charge;
      console.log(chargeSuccessEvent.metadata);
    }

    return response.status(200).send({ sig });
  }
}
