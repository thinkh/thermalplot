/**
 * Created by Holger Stitz on 19.08.2014.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';

/**
 * the current selection everything in milliseconds [ms]
 */
export class PVDWindowResize {

  private listeners = d3.dispatch('change');

  private debounceTime = 500;

  constructor() {
    this.addEvent(window, 'resize', this.debounce((event) => { this.fire('change'); }, this.debounceTime));
  }

  on(type: string, listener?) {
    if (arguments.length < 2)
      return this.listeners.on(type);
    this.listeners.on(type, listener);
    return this;
  }

  private fire(type: string, ...args: any[]) {
    this.listeners[type].apply(this, args);
  }

  addEvent(elem, type, eventHandle) {
    if (elem == null || typeof (elem) == 'undefined') {
      return;
    }
    if (elem.addEventListener) {
      elem.addEventListener(type, eventHandle, false);
    } else if (elem.attachEvent) {
      elem.attachEvent('on' + type, eventHandle);
    } else {
      elem['on' + type] = eventHandle;
    }
  }

  /**
   * Underscore debounce function
   * @see http://underscorejs.org/#debounce
   * @param func
   * @param wait
   * @param immediate
   * @returns {function(): any}
   */
  private debounce(func, wait, immediate?) {
    var that = this;
    var timeout, args, context, timestamp, result;

    var later = function () {
      var last = that.now() - timestamp;

      if (last < wait && last >= 0) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          if (!timeout) context = args = null;
        }
      }
    };

    return function () {
      context = this;
      args = arguments;
      timestamp = that.now();
      var callNow = immediate && !timeout;
      if (!timeout) timeout = setTimeout(later, wait);
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    }

  }

  private now(): any {
    return Date.now || function () {
      return new Date().getTime();
    };
  }
}

export default angular.module('services.pvdWindowResize', []).service('pvdWindowResize', PVDWindowResize).name;
