import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { NumberAttribute } from "../models/Models";
import Animator, { PVDAnimator } from "./Animator";
import DataService, { PVDDataService } from './DataService';

/**
 * utility to generate simple normalized number values for attributes
 */
export class PVDDataGenerator {
  private listeners = d3.dispatch('generate', 'start', 'stop');
  private intervalId = -1;
  private _animator: PVDAnimator;
  private _dt: number = 2000;

  attrs = new Array<NumberAttribute>();

  constructor(pvdAnimator: PVDAnimator, pvdDataService: PVDDataService) {
    this._animator = pvdAnimator;
    //attach to the dataservice
    pvdDataService.on('open.generate', () => this.start());
    pvdDataService.on('close.generate', () => this.stop());
  }

  reset() {
    this.stop();
    this.attrs.length = 0;
  }

  get dt() {
    return this._dt;
  }

  set dt(value: number) {
    this._dt = value;
    this.updateDT();
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
   * whether items are currently generated
   * @returns {boolean}
   */
  get isGenerating() {
    return this.intervalId >= 0;
  }

  start(): boolean {
    if (this.isGenerating) {
      return false;
    }
    this.fire('start');
    this.intervalId = setInterval(() => this.tick(), this.dt);
    return true;
  }

  stop(): boolean {
    if (!this.isGenerating) {
      return true
    }
    clearInterval(this.intervalId);
    this.intervalId = -1;
    this.fire('stop');
    return true;
  }

  private updateDT() {
    if (!this.isGenerating) {
      return;
    }
    clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.tick(), this.dt);
    return true;
  }

  private generate(attr: NumberAttribute, now: number) {
    attr.push(now, Math.random());
  }

  private tick() {
    var now = this._animator.now;
    this.fire('generate', now);
    this.attrs.forEach((attr) => this.generate(attr, now));
  }
}
export default angular.module('services.pvdDataGenerator', [DataService, Animator]).service('pvdDataGenerator', PVDDataGenerator).name;