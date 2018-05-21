/**
 * Created by Samuel Gratzl on 17.04.2014.
 */

import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';

/**
 * interface for an animated object
 */
export interface IAnimateable {
  /**
   * layout phase given dt and now the result will be given to the update method
   * @param dt
   * @param now
   */
  layout(dt: number, now: number): any;
  /**
   * update phase given dt, now, and the result of the layout call
   * @param dt
   * @param now
   * @param layouted
   */
  update(dt: number, now: number, layouted: any): void;
}

function utcNow() {
  return Date.now();
}

export interface IStepper {
  refStepWidth: number;
  prev(now: number): number;
  step(now: number): number;
  step(now: number, steps: number): number;
  round(ts: number): number;
}

class ConstantStepper implements IStepper {
  constructor(public refStepWidth: number) {

  }

  prev(now: number) {
    return this.step(now, -1);
  }

  step(now: number, steps = 1) {
    return now + this.refStepWidth * steps;
  }

  round(ts: number) {
    //round to full date
    return this.refStepWidth * d3.round(ts / this.refStepWidth, 0);
  }
}

class UnitStepper implements IStepper {
  constructor(private unit: string) {

  }

  prev(now: number) {
    return this.step(now, -1);
  }

  get refStepWidth() {
    switch (this.unit) {
      case 'year':
        return 365 * 24 * 60 * 60 * 1000;
      case 'month':
        return 30 * 24 * 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      case 'minute':
        return 60 * 1000;
      case 'second':
        return 1000;
    }
    return 1;
  }

  step(now: number, steps = 1) {
    if (!isFinite(now) || isNaN(now)) {
      return now;
    }
    var d = UnitStepper.utc(now);
    switch (this.unit) {
      case 'year':
        return Date.UTC(d.getUTCFullYear() + steps, 0);
      case 'month':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + steps);
      default:
        return now + this.refStepWidth * steps;
    }
  }

  static utc(utc: number) {
    var r = new Date();
    r.setTime(utc);
    return r;
  }

  round(ts: number) {
    if (!isFinite(ts) || isNaN(ts)) {
      return ts;
    }
    var d = UnitStepper.utc(ts);
    switch (this.unit) {
      case 'year':
        return Date.UTC(d.getUTCFullYear(), 0);
      case 'month':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth());
      case 'day':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDay());
      case 'hour':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDay(), d.getUTCHours());
      case 'minute':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDay(), d.getUTCHours(), d.getUTCMinutes());
      case 'second':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDay(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
    }
    return d.valueOf();
  }
}

export function createStepper(step: number, unit: string = '?') {
  if (unit === 'year' || unit === 'month' || unit === 'day' || unit === 'minute' || unit === 'second') {
    return new UnitStepper(unit);
  }
  return new ConstantStepper(step);
}


/**
 * animator class, which ticks every seconds (by default) and updates all registered children
 */
export class PVDAnimator {
  private listeners = d3.dispatch('tick', 'start', 'stop');
  private intervalId = -1;
  private animatables = new Array<IAnimateable>();
  /**
   * delta time between two ticks in milliseconds
   * @type {number}
   * @private
   */
  private _dt: number = 1000; //[ms]

  stepper: IStepper = new ConstantStepper(1000);

  //in UTC time
  now = utcNow(); //shift of the real now to the virtual one, which is visualized
  /**
   * when did we stop, to proper calculate the next now when resuming
   * @type {number}
   */
  private stopAt = -1;

  get dt() {
    return this._dt;
  }

  set dt(value: number) {
    this._dt = value;
    this.updateDT();
  }
  /**
   * fps, computed by the delta time
   * @returns {number}
   */
  get fps() {
    return 1000 / this.dt;
  }

  set fps(value: number) {
    this.dt = 1000 / value;
  }

  on(type: string, listener?) {
    if (arguments.length < 2) {
      return this.listeners.on(type);
    }
    this.listeners.on(type, listener);
    return this;
  }

  private fire(type: string, ...args: any[]) {
    this.listeners[type].apply(this, args);
  }

  /**
   * is the animator currently ticking
   * @returns {boolean}
   */
  get isAnimating(): boolean {
    return this.intervalId >= 0;
  }

  start(): boolean {
    if (this.isAnimating) {
      return false;
    }
    this.fire('start');
    //create the next now between the stop time and now now
    if (this.stopAt > 0) {
      var delta = Math.round((utcNow() - this.stopAt) / this.dt);
      this.now = this.stepper.step(this.now, delta);
    }
    this.intervalId = setInterval(() => this.tick(), this.dt);
    return true;
  }

  stop(): boolean {
    if (!this.isAnimating) {
      return true
    }
    this.stopAt = utcNow();
    clearInterval(this.intervalId);
    this.intervalId = -1;
    this.fire('stop');
    return true;
  }

  /**
   * the delta time changed, need to update the interval
   * @returns {boolean}
   */
  private updateDT() {
    if (!this.isAnimating) {
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.tick(), this.dt);
    return true;
  }

  private tick() {
    //var now = Date.now();
    //compute delta between previous frame
    var next = this.stepper.step(this.now);
    var dt = next - this.now; //use the optimal time for consistency: now - this.prevNow;
    this.now = next;
    //shift time
    //now -= this.timeShift;
    this.fire('tick', dt, this.now);
    //console.log(dt);
    this.updateImpl(this.animatables, dt, this.now);
  }

  private updateImpl(anim: IAnimateable[], dt: number, now: number) {
    var i: number, layouts = [];
    //first phase layout everything
    //work on a copy
    anim = anim.slice();
    for (i = 0; i < anim.length; ++i) {
      layouts[i] = anim[i].layout(dt, now);
    }
    //second phase update the stuff and provide the layout result
    for (i = 0; i < anim.length; ++i) {
      anim[i].update(dt, now, layouts[i]);
    }
  }

  /**
   * force to update a specific IAnimateable
   * @param animatable
   */
  update(...animatable: IAnimateable[]) {
    /*
    var now = Date.now(),
      dt = now - this.prevNow;
    //this.prevNow = now; do not store the difference since it just local update
    now -= this.timeShift;
    */
    this.updateImpl(animatable, this.stepper.refStepWidth, this.now);
  }

  push(...animatable: IAnimateable[]) {
    animatable.forEach((a) => {
      var i = this.animatables.indexOf(a);
      if (i < 0) {
        this.animatables.push.apply(this.animatables, animatable);
      }
    });
  }

  remove(...animatable: IAnimateable[]) {
    animatable.forEach((a) => {
      var i = this.animatables.indexOf(a);
      if (i >= 0) {
        this.animatables.splice(i, 1);
      }
    });
  }
}
export default angular.module('services.pvdAnimator', []).service('pvdAnimator', PVDAnimator).name;

//register a custom interpolator for percentages
/*d3.interpolators.push((a: string, b: string) => {
  var re = /^([0-9,.]+)%$/,
    ma: any, va: number,
    mb: any, vb: number;
  if (((ma = re.exec(a)) && (mb = re.exec(b)))) {
    va = parseFloat(ma[1]);
    vb = parseFloat(mb[1]);
    return function(t) {
      return (va+vb*t)+'%'
    }
  }
})*/
