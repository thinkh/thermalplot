/// <reference path='../../../tsd.d.ts' />


/**
 * the current selection everything in milliseconds [ms]
 */
class PVDSelection {
  constructor(public point: number, public past: number, public future: number, public steps = 1) {

  }

  get hasDefinedStart() {
    return isFinite(this.past);
  }

  get start() {
    return this.point - this.past;
  }

  get end() {
    return this.point + this.future;
  }
  
  public toPlainObject() {
    return {
      point: this.point, 
      past: this.past, 
      future: this.future, 
      steps: this.steps
    }
  }
}
/**
 * service holding the current data time selection (min, max)
 */
class PVDDataSelection {
  private listeners = d3.dispatch('change', 'pinned', 'interacting', 'select', 'selectall', 'infra', 'hover', 'past', 'nodeWidth', 'dragStart', 'drag', 'dragEnd', 'indexPoint', 'doi', 'loadingOverlay', 'hoverTime', 'availableTime');
  //by default: relative to now and everything in the past but nothing in the future
  private _past:number = 300000; //[ms]
  private pastNotDefaultAnyMore = false;
  private point:number = 0; //[ms]
  private future:number = 0; //[ms]
  private _steps:number = 5;
  private _indexPoint:number = 0; //[ms]
  private _hoverTime: number = -1; //[ms]
  private _doi : PVDDOI.DOIFormula = null;
  private _availabeTimeRange = [0,0]; //[ms] the overall available time range (e.g., first log entry)
  /**
   * whether the point is given in relative coordinates to 'now' (false) or a absolute timestamp (true)
   */
  private _isPinned: boolean  = false;

  private _selections:PVDModels.Node[] = [];
  private _infra:PVDModels.Infrastructure = null;
  private _hover:PVDModels.Node = null;

  private _nodeWidth : number = 5*12;

  //previous times for computing a proper time shift such that bins are aligned even across multiple frames
  private timeShiftRefTime : number = -1;
  private timeShift: number = 0;

  constructor(private pvdInfrastructureMapper : PVDInfrastructureMapper, private $q : ng.IQService, private pvdAnimator: PVDAnimator) {
    pvdAnimator.on('start', () => {
      this.timeShiftRefTime = -1; //reset
    });
  }

  on(type:string, listener?) {
    if (arguments.length < 2)
      return this.listeners.on(type);
    this.listeners.on(type, listener);
    return this;
  }

  private fire(type:string, ...args:any[]) {
    //console.debug('fired event "' + type + '" with', args);
    this.listeners[type].apply(this, args);
  }

  /**
   * notifier for other selection visualizations that the user is currently manipulating / interacting with the selection
   */
  set interacting(v : boolean) {
    this.fire('interacting',v);
  }

  /**
   * whether the selection is absolute (pinned) or relative
   * @returns {boolean}
   */
  get isPinned() {
    return this._isPinned;
  }

  /**
   * return the current selection
   * @param now current time to be able to resolve relative selections
   * @returns {PVDSelection}
   */
  getSelection(now: number):PVDSelection {
    var p = this.isPinned ? this.point : (now + this.point);
    return this.getRawSelection(p);
  }

  /**
   * toggles between pinned and relative selection
   * @param now
   * @returns {boolean}
   */
  toggleSelectionType() {
    var sel = this.getSelection(this.point);
    if(this.isPinned) {
      this.setRelativeSelection(0, this.past);
    } else {
      this.setPinnedSelection(this.point, this.past);
    }
    return this.isPinned;
  }

  private getRawSelection(p : number = this.point):PVDSelection {
    return new PVDSelection(p,this.past, this.future, this._steps);
  }

  get steps() {
    return this._steps;
  }

  set steps(val: number) {
    if (this._steps === val) {
      return;
    }
    this.setSelection(this.isPinned, this.point, this._past, this.future, val);
  }

  get nodeWidth() {
    return this._nodeWidth;
  }

  set nodeWidth(val: number) {
    if (this._nodeWidth === val) {
      return;
    }
    var bak = this._nodeWidth;
    this._nodeWidth = val;
    this.timeShiftRefTime = -1;
    this.fire('nodeWidth', bak, val);
  }

  set doi(doi: PVDDOI.DOIFormula) {
    var bak = this.doi;
    this._doi = doi;
    this.fire('doi', bak, doi);
  }

  get doi() {
    return this._doi;
  }

  adaptToStepSize(step: number, prev: number) {
    this._nodeWidth *= prev / step;
    if (!this.pastNotDefaultAnyMore) {
      this._past /= prev / step; //don't auto update past according to step size in this case it is absolute
    }
  }

  get past() {
    return this._past;
  }

  set indexPoint(value:number) {
    var bak = this._indexPoint;
    this._indexPoint = value;
    this.fire('indexPoint', bak, value);
  }

  get indexPoint() {
    return this._indexPoint;
  }

  set hoverTime(value:number) {
    if (value === this._hoverTime) {
      return;
    }
    var bak = this._hoverTime;
    this._hoverTime = value;
    this.fire('hoverTime', bak, value);
  }

  get hoverTime() {
    return this._hoverTime;
  }

  setAvailableTimeRange(from:number, to:number) {
    var bak = this._availabeTimeRange.slice();
    this._availabeTimeRange = [from, to];
    this.fire('availableTime', this._availabeTimeRange, bak);
  }

  /**
   * sets the selection to an absolute selection
   * @param point selected time [ms]
   * @param past start past ms in the past
   * @param future start and future ms in the future
   */
  setPinnedSelection(point: number, past: number = Number.NEGATIVE_INFINITY, future : number = 0, steps : number = this.steps) {
    this.setSelection(true, point, past, future, steps);
  }
  /**
   * set the selection to an relative position
   * @param shift shift the current time shift ms, additive
   * @param past start past ms in the past
   * @param future start and future ms in the future
   */
  setRelativeSelection(shift: number, past: number = Number.NEGATIVE_INFINITY, future : number = 0, steps : number = this.steps) {
    this.setSelection(false, shift, past, future, steps);
  }

  private setSelection(isPinned: boolean, point: number, past: number = Number.NEGATIVE_INFINITY, future : number = 0, steps : number = this.steps) {
    if (this._isPinned === isPinned && this.point === point && this._past === past && this.future === future && this.steps === steps) {
      return;
    }
    if (this._isPinned !== isPinned) {
      this._isPinned = isPinned;
      this.fire('pinned',isPinned);
    }

    this.timeShiftRefTime = -1;

    var bak = this.getRawSelection(); //doesn't matter we have _isPinned set
    this.point = point;
    this._past = past;
    if (bak.past !== past) {
      this.pastNotDefaultAnyMore = true;
      this.fire('past', past, bak.past);
    }
    this.future = future;
    this._steps = steps;
    this.fire('change',this.getRawSelection(), bak);
  }

  /**
   * resets the selection to its default value
   */
  resetSelection() {
    this.setRelativeSelection(0, 5*this.pvdAnimator.stepper.refStepWidth, 0, 5);
  }

  /**
   * select something and fire events
   * @param selection
   */
  set selection(selection: PVDModels.Node) {
    if (this._selections[0] === selection) { //no change
      return;
    }
    var bak = this._selections;
    if (selection) {
      this._selections = [selection];
      this.fire('select', selection, bak[0] || null);
      this.fire('selectall', selection, this._selections, bak);
    } else {
      this._selections = [];
      this.fire('select', null, bak[0] || null);
      this.fire('selectall', null, this._selections, bak);
    }
  }

  clearSelection() {
    var s = this._selections;
    if (s.length === 0) {
      return;
    }
    this._selections = [];
    this.fire('select', null, s[0]);
    this.fire('selectall', null, this._selections, s);
  }

  isSelected(selection: PVDModels.Node) {
    return this._selections.indexOf(selection) >= 0;
  }

  addToSelection(selection: PVDModels.Node) {
    var s = this._selections;
    if (s.length === 0) {
      this.selection = selection;
    } else {
      s.push(selection);
      this.fire('selectall', selection, s, s.slice(0,s.length-1));
    }
  }

  addBulkSelection(selection: PVDModels.Node[], replaceExisting = true) {
    var s = this._selections;
    if (replaceExisting) {
      this._selections = selection;
    } else {
      this._selections = s.concat(selection);
    }
    this.fire('selectall', selection, this._selections, s.slice(0,s.length-1));
  }

  removeFromSelection(selection: PVDModels.Node) {
    var index = this._selections.indexOf(selection);
    if (index >= 0) {
      if (this._selections.length === 1) {
        this.selection = null;
      } else {
        var b = this._selections.slice();
        this._selections.splice(index,1);
        this.fire('selectall', null, this._selections, b);
      }
    }
  }

  get selections() {
    return this._selections;
  }

  /**
   * return the current selection
   * @returns {PVDModels.Node}
   */
  get selection() {
    return this._selections.length > 0 ? this._selections[0] : null;
  }

  /**
   * get the selection in a different hierarchy
   * @param id
   * @returns {*}
   */
  getSelectionAs(id : string) {
    var s = this.selection;
    if (s) {
      return this.pvdInfrastructureMapper.mapTo(s, id);
    } else {
      return this.$q.when(null);
    }
  }

  getSelectionAsUnchecked(id : string, _else : PVDModels.Node[] = []) {
    var s = this.selection;
    if (s) {
      return this.pvdInfrastructureMapper.mapToUnchecked(s, id, _else);
    } else {
      return _else;
    }
  }

  /**
   * get multiple selections in a different hierarchy
   * @param id
   * @returns {*}
   */
  /*getSelectionsAs(id : string) {
    // TODO implement
  }*/

  /**
   * get multiple selections in a different hierarchy
   * @param id
   * @returns {*}
   */
  getSelectionsAsUnchecked(id : string, _else : PVDModels.Node[] = []) {
    if(this.selections.length > 0) {
      var r = [];
      this.selections.forEach((s) => {
        r = r.concat(this.pvdInfrastructureMapper.mapToUnchecked(s, id, _else));
      });
      return r;

    } else {
      return _else;
    }
  }

  /**
   * select something and fire events
   * @param selection
   */
  set infra(infra:PVDModels.Infrastructure) {
    if (this._infra === infra) { //no change
      return;
    }
    var bak = this._infra;
    this._infra = infra;
    this.fire('infra', infra, bak);
  }

  /**
   * return the current selection
   * @returns {PVDModels.Infrastructure}
   */
  get infra():PVDModels.Infrastructure {
    return this._infra;
  }

  /**
   * select something and fire events
   * @param selection
   */
  set hover(node:PVDModels.Node) {
    if (this._hover === node) { //no change
      return;
    }
    var bak = this._hover;
    this._hover = node;
    this.fire('hover', node, bak);
  }

  /**
   * return the current selection
   * @returns {PVDModels.Node}
   */
  get hover():PVDModels.Node {
    return this._hover;
  }

  get binWidth() {
    return this.past / this.steps;
  }

  /**
   * Old stepper function that takes the bin and step width into account
   * (used for old CloudGazer VAST use case)
   */
  /*get stepper() {
    var b = this.binWidth;
    //TODO HACK if the binwith is at most 10 percent different to the reference one use the reference real stepper
    if (Math.abs(b-this.pvdAnimator.stepper.refStepWidth)/this.pvdAnimator.stepper.refStepWidth < 0.1) {
      return this.pvdAnimator.stepper;
    } else {
      return createStepper(b);
    }
  }*/

  /**
   * Use always the animator stepper to show the raw values without binning or finer bins
   * (used for ThermalPlot)
   * @returns {IStepper}
   */
  get stepper() {
    return this.pvdAnimator.stepper;
  }


  /**
   * computes the time shift, which is needed to align the bins over time
   * @param now
   * @return {number}
   */
  binOffset(now: number) {
    if (this.timeShiftRefTime === now) {
      return this.timeShift;
    }
    //not yet computed, use 0
    if (this.timeShiftRefTime <= 0) {
      this.timeShiftRefTime = now;
      this.timeShift = 0;
      return 0;
    }
    var binWidth = this.binWidth;
    //compute time shift if the previous time is shifted just by bin width
    var t = this.timeShiftRefTime + this.timeShift;
    var i =0;
    while(t < now) { //one more bin is visible
      t += binWidth;
      i++;
      if (i > 1000) {
        debugger;
      }
    }
    //time time = previous shown time
    this.timeShift = t - now;
    this.timeShiftRefTime = now;
    return this.timeShift;
  }


  dragStart(node:PVDModels.Node) {
    this.fire('dragStart', node);
  }

  drag(node:PVDModels.Node) {
    this.fire('drag', node);
  }

  dragEnd(node:PVDModels.Node) {
    this.fire('dragEnd', node);
  }

  loadingOverlay(isVisible:boolean) {
    this.fire('loadingOverlay', isVisible);
  }
}
angular.module('pipesVsDamsApp').service('pvdDataSelection', PVDDataSelection);
