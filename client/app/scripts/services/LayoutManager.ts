/**
 * Created by Holger Stitz on 09.09.2014.
 */
/// <reference path='../../../tsd.d.ts' />

class PVDHierarchyLayoutConfig {

  // vast dataset
  public sortBy:string = 'alphabet'; // alphabet || activity
  public autoShrink:boolean = false;
  public active:boolean = false;

  // thermal layout
  public showPhysicsBodies:boolean = false;
  public showTrajectories:boolean = false;
  public bodyCollisionDetection:boolean = false;
  public deltaTime = '10'; // in [s]
  public physicsOptions = {
    edgeCollision: {
      restitution: '0.99',
      friction: '1.0'
    },
    bodies: {
      mass: '1.0',
      restitution: '1.0',
      friction: '0.8'
    }
  };

  constructor(public infra:PVDModels.Infrastructure,
              public layoutId:string) {
  }
}

class PVDLayoutManager {
  private listeners = d3.dispatch('initialized', 'layout', 'nodes');

  // access from AngularJS
  public layouts:any[] = [];
  public configs:PVDHierarchyLayoutConfig[] = [];

  private layoutsMap:D3.Map<any> = d3.map();
  private configsMap:D3.Map<PVDHierarchyLayoutConfig> = d3.map();

  private _infrastructures:PVDModels.Infrastructure[] = [];

  constructor() {
    // add new layouts here and in createSelectedLayout()
    this.reset();
  }

  reset() {
    this.layouts = [];
    this.layoutsMap = d3.map();
    this.configs = [];
    this.configsMap = d3.map();
    this._infrastructures = [];

    this.layouts.push(PVDLayouts.PVDAbacusLayout);
    this.layouts.push(PVDLayouts.PVDGridLayout);
    this.layouts.push(PVDLayouts.PVDNodeLinkLayout);
    this.layouts.push(PVDLayouts.PVDIciclePlotLayout);
    this.layouts.push(PVDLayouts.PVDForceLayout);

    this.layouts.forEach((d) => {
      this.layoutsMap.set(d.ID, d);
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

  addInfrastructure(infra:PVDModels.Infrastructure) {
    if(infra === null) { return; }

    this._infrastructures.push(infra);

    // special case for vm
    //if(infra.id === 'vm') {
    //  this._createLayoutConfig(infra, PVDLayouts.PVDNodeLinkLayout.ID);
    //} else {
      this._createLayoutConfig(infra, PVDLayouts.PVDGridLayout.ID);
    //}
  }

  set infrastructures(infras:PVDModels.Infrastructure[]) {
    this._infrastructures = infras;
  }

  get infrastructures():PVDModels.Infrastructure[] {
    return this._infrastructures;
  }

  private _createLayoutConfig(infra, layoutId) {
    var c = new PVDHierarchyLayoutConfig(infra, layoutId);
    this.configs.push(c);
    this.configsMap.set(infra.id, c);
  }

  getLayoutConfig(hierarchyId:string):PVDHierarchyLayoutConfig {
    return this.configsMap.get(hierarchyId);
  }

  // if you don't care about a specific layout config, use the first one
  getFirstLayoutConfig():PVDHierarchyLayoutConfig {
    if(this.configs.length === 0) {
      return null;
    }
    return this.configsMap.get(this.configs[0].infra.id);
  }

  /**
   * Creates a new instance of the selected layout
   * @returns {PVDVisualizations.IPVDHierarchyLayout}
   */
  getLayoutByHierarchyId(hierarchyId:string):PVDLayouts.IPVDLayout {
    var selectedConfig = this.configsMap.get(hierarchyId);

    if(selectedConfig === undefined) {
      return null;
    } else {
      return this.getLayoutById(selectedConfig.layoutId);
    }
  }

  getLayoutById(layoutId:string):PVDLayouts.IPVDLayout {
    var type : any = this.layoutsMap.get(layoutId);
    return new type();
  }

  updateNodes(layoutConfig) {
    this.fire('nodes', layoutConfig);
  }

  updateLayout(layoutConfig:PVDHierarchyLayoutConfig) {
    this.fire('layout', layoutConfig);
  }

  initialized() {
    this.fire('initialized');
  }
}

angular.module('pipesVsDamsApp').service('pvdLayoutManager', PVDLayoutManager);
