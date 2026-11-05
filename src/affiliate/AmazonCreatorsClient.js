import { ALLOWED_AMAZON_MARKETPLACES } from './AmazonProductionOfferContract.js';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export class AmazonCreatorsClient {
  constructor({ enabled = false, transport, marketplace, partnerTag, perSecond, daily, now = Date.now } = {}) {
    if (typeof enabled !== 'boolean') throw fail('CREATORS_INVALID_CONFIG');
    this.enabled = enabled;
    if (!enabled) return;
    if (typeof transport !== 'function' || !ALLOWED_AMAZON_MARKETPLACES.has(marketplace) ||
        typeof partnerTag !== 'string' || !partnerTag.trim() ||
        !Number.isSafeInteger(perSecond) || perSecond < 1 ||
        !Number.isSafeInteger(daily) || daily < 1 || typeof now !== 'function') {
      throw fail('CREATORS_INVALID_CONFIG');
    }
    this.transport = transport;
    this.marketplace = marketplace;
    this.partnerTag = partnerTag;
    this.perSecond = perSecond;
    this.daily = daily;
    this.now = now;
    this.calls = [];
    this.day = null;
    this.dailyCount = 0;
    this.lastTime = 0;
  }

  async request(operation, params) {
    if (!this.enabled) throw fail('CREATORS_DISABLED');
    if (params === null || typeof params !== 'object' || Array.isArray(params) ||
        Object.getPrototypeOf(params) !== Object.prototype) throw fail('CREATORS_INVALID_REQUEST');
    let time;
    try {
      time = this.now();
    } catch {
      throw fail('CREATORS_CLOCK_ERROR');
    }
    if (!Number.isSafeInteger(time) || time < this.lastTime) throw fail('CREATORS_CLOCK_ERROR');
    const day = new Date(time).toISOString().slice(0, 10);
    if (this.day !== day) {
      this.day = day;
      this.dailyCount = 0;
    }
    this.calls = this.calls.filter(start => time - start < 1000);
    if (this.dailyCount >= this.daily || this.calls.length >= this.perSecond) throw fail('CREATORS_QUOTA_EXCEEDED');
    this.calls.push(time);
    this.dailyCount++;
    this.lastTime = time;
    try {
      return await this.transport({ operation, marketplace: this.marketplace, partnerTag: this.partnerTag, params });
    } catch {
      throw fail('CREATORS_TRANSPORT_ERROR');
    }
  }

  getItems(params) { return this.request('GetItems', params); }
  searchItems(params) { return this.request('SearchItems', params); }
  getVariations(params) { return this.request('GetVariations', params); }
  getBrowseNodes(params) { return this.request('GetBrowseNodes', params); }
}
