class Queue {
  constructor(name, opts = {}) {
    this.name = name;
    this.opts = opts;
  }
  async add(name, data, opts) {
    return { id: 'job-1', name, data, opts };
  }
  async close() { /* no-op */ }
}

class Worker {
  constructor(name, processor, opts = {}) {
    this.name = name;
    this.processor = processor;
    this.opts = opts;
    this._events = {};
  }
  on(event, handler) {
    this._events[event] = handler;
    return this;
  }
  async close() { /* no-op */ }
}

class QueueScheduler {
  constructor(name, opts = {}) {
    this.name = name;
    this.opts = opts;
  }
  async close() { /* no-op */ }
}

module.exports = { Queue, Worker, QueueScheduler };
