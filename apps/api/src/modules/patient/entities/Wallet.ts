export interface WalletData {
  id: string;
  patientId: string;
  balanceKobo: bigint;
}

export class Wallet {
  constructor(private data: WalletData) {}

  get id() { return this.data.id; }
  get patientId() { return this.data.patientId; }
  get balanceKobo() { return this.data.balanceKobo; }

  toJSON() {
    return { id: this.data.id, patientId: this.data.patientId, balanceKobo: this.data.balanceKobo.toString() };
  }
}
