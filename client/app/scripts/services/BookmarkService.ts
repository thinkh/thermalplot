/// <reference path='../../../tsd.d.ts' />

/**
 * stores the bookmarks for a certain dataset
 */
class PVDBookmarkService {
  private listeners = d3.dispatch('set');
  private bookmarks = [];

  constructor() {}

  on(type:string, listener?) {
    if (arguments.length < 2)
      return this.listeners.on(type);
    this.listeners.on(type, listener);
    return this;
  }

  private fire(type:string, ...args:any[]) {
    this.listeners[type].apply(this, args);
  }

  public get() {
    return this.bookmarks;
  }

  public set(bookmarks) {
    this.bookmarks = bookmarks.map(function(d) {
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

angular.module('pipesVsDamsApp').service('pvdBookmarkService', PVDBookmarkService);
