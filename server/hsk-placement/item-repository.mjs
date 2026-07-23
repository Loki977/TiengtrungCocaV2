import fs from 'node:fs';

export class PlacementItemRepository {
  constructor({
    itemsUrl = new URL('./data/items.json', import.meta.url),
    configUrl = new URL('./data/test-config.json', import.meta.url)
  } = {}) {
    this.config = JSON.parse(fs.readFileSync(configUrl, 'utf8'));
    this.items = JSON.parse(fs.readFileSync(itemsUrl, 'utf8'));
    this.itemMap = new Map(this.items.map((item) => [item.id, item]));
  }

  getAll() {
    return this.items;
  }

  getById(id) {
    return this.itemMap.get(id) || null;
  }

  getConfig() {
    return this.config;
  }
}

export const placementItemRepository = new PlacementItemRepository();
