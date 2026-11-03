/**
 * Portefeuille du joueur. Les jeux prélèvent la mise au moment où le coup est joué
 * (`take`) puis versent le retour à la fin (`settle`). Tant qu'un coup est en cours
 * son montant reste « en jeu », ce qui empêche de déclarer la faillite trop tôt.
 */
type Listener = () => void;

export class Wallet {
  private _balance: number;
  private inPlayByGame = new Map<string, number>();
  private listeners = new Set<Listener>();

  constructor(balance = 0) {
    this._balance = balance;
  }

  get balance(): number {
    return this._balance;
  }

  get inPlay(): number {
    let t = 0;
    for (const v of this.inPlayByGame.values()) t += v;
    return t;
  }

  inPlayFor(game: string): number {
    return this.inPlayByGame.get(game) ?? 0;
  }

  canAfford(amount: number): boolean {
    return amount <= this._balance;
  }

  /** Prélève une mise pour un jeu. Lève une erreur si les fonds manquent. */
  take(game: string, amount: number): void {
    if (!(amount > 0)) throw new RangeError('mise invalide');
    if (amount > this._balance) throw new Error('fonds insuffisants');
    this._balance -= amount;
    this.inPlayByGame.set(game, this.inPlayFor(game) + amount);
    this.emit();
  }

  /** Clôt le coup en cours d'un jeu et verse `returned` (mise comprise). */
  settle(game: string, returned: number): void {
    if (returned < 0) throw new RangeError('retour négatif');
    this._balance += returned;
    this.inPlayByGame.delete(game);
    this.emit();
  }

  /** Ajout direct (avance de la mafia). */
  deposit(amount: number): void {
    this._balance += amount;
    this.emit();
  }

  /** Retrait direct (remboursement de la dette). */
  withdraw(amount: number): void {
    if (amount > this._balance) throw new Error('fonds insuffisants');
    this._balance -= amount;
    this.emit();
  }

  /** Abandonne tous les coups en cours (fin de partie). */
  forfeitAll(): void {
    this.inPlayByGame.clear();
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
