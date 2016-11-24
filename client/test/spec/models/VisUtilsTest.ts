/**
 * Created by Samuel Gratzl on 23.05.2014.
 */
/// <reference path="tsUnit.ts" />
/// <reference path="tsUnitUtils.ts" />
/// <reference path="../../../app/scripts/directives/VisUtils.ts" />

class VisUtilsTest extends tsUnit.TestClass {

  testTsNormalizer() {
    var v = PVDVisualizations.tsNormalizer(0,1000);
    this.areIdentical(2,v(1000));
    this.areIdentical(2,v(1001));
    this.areIdentical(2,v(1249));
    this.areIdentical(2,v(1251));
    this.areIdentical(2,v(1260));
    this.areIdentical(3,v(1490));
    this.areIdentical(4,v(1800));
    this.areIdentical(4,v(2000));
    this.areIdentical(4,v(2200));
    this.areIdentical(5,v(2500));
  }
}