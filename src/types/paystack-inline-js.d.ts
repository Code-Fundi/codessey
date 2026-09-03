declare module "@paystack/inline-js" {
  export default class PaystackPop {
    resumeTransaction(
      accessCode: string,
      callbacks?: {
        onSuccess?: (transaction: { reference: string }) => void;
        onCancel?: () => void;
        onError?: (error: { message: string }) => void;
      },
    ): void;
    newTransaction(options: Record<string, unknown>): void;
  }
}
