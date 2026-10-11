/** Валюта из справочника `GET /api/currencies`. */
export interface Currency {
  code: string;
  kind: 'fiat' | 'crypto';
  decimals: number;
  symbol: string;
  name: string;
}
