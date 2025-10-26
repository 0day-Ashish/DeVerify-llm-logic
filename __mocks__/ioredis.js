class FakeRedis {
  constructor() {}
  quit() { return Promise.resolve(); }
  disconnect() {}
  // Optional no-ops used by BullMQ under the hood
  duplicate() { return new FakeRedis(); }
  on() { return this; }
}
module.exports = FakeRedis;
