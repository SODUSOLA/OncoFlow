import type { walletTransactionTypeEnum } from "../../../db/enums.js";

type WalletTransactionType = (typeof walletTransactionTypeEnum.enumValues)[number];

export interface WalletTransactionData {
  id: string;
  walletId: string;
  paymentId: string | null;
  type: WalletTransactionType;
  amountKobo: bigint;
  createdAt: Date;
}

export class WalletTransaction {
  constructor(private data: WalletTransactionData) {}

  toJSON() {
    return {
      id: this.data.id,
      walletId: this.data.walletId,
      paymentId: this.data.paymentId,
      type: this.data.type,
      amountKobo: this.data.amountKobo.toString(),
      createdAt: this.data.createdAt.toISOString(),
    };
  }
}
