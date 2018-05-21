import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';

/**
 * stores the bookmarks for a certain dataset
 */
export class PVDBookmarkService {
  private listeners = d3.dispatch('set');
  private bookmarks = [];

  constructor() { }

  on(type: string, listener?) {
    if (arguments.length < 2)
      return this.listeners.on(type);
    this.listeners.on(type, listener);
    return this;
  }

  private fire(type: string, ...args: any[]) {
    this.listeners[type].apply(this, args);
  }

  public get() {
    return this.bookmarks;
  }

  public set(bookmarks) {
    this.bookmarks = bookmarks.map(function (d) {
      d.ts = new Date(d.ts);
      d.title = d.title.replace('%time%', d.ts.toUTCString());
      return d;
    });
    this.fire('set', this.bookmarks);
  }

  public clear() {
    this.set([]);
  }
}

export default angular.module('services.pvdBookmarkService', []).service('pvdBookmarkService', PVDBookmarkService).name;
