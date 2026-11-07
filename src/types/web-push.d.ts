declare module "web-push" {
  export type PushSubscription = {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };

  export type SendNotificationOptions = {
    vapidDetails?: {
      subject: string;
      publicKey: string;
      privateKey: string;
    };
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
  };

  const webpush: {
    sendNotification(
      subscription: PushSubscription,
      payload?: string | Buffer,
      options?: SendNotificationOptions
    ): Promise<unknown>;
  };

  export default webpush;
}
