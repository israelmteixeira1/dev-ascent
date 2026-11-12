/** The current time, injected so that scheduling can be tested without waiting days. */
export type Clock = () => Date;

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = () => new Date();
