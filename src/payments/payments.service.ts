import { Request, Response } from 'express';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { NATS_SERVICE, envs } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.STRIPE_SECRET_KEY);
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(NATS_SERVICE) private readonly serviceClient: ClientProxy,
  ) {}

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

    return {
      cancelUrl: session.cancel_url,
      successUrl: session.success_url,
      url: session.url,
    };
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
      const payload = {
        stripePaymentId: chargeSuccessEvent.id,
        orderId: chargeSuccessEvent.metadata.orderId,
        receipUrl: chargeSuccessEvent.receipt_url,
      };

      // Emit event to orders service
      this.serviceClient.emit({ cmd: 'order-payment-success' }, payload);
    }

    return response.status(200).send({ sig });
  }
}
