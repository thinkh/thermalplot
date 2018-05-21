import { TimedList } from "../../../src/scripts/models/Timed";

/**
 * Created by AK113797 on 17.04.2014.
 */
/// <reference path="tsUnit.ts" />
/// <reference path="tsUnitUtils.ts" />

class TimedListTest extends tsUnit.TestClass {

  private t = new TimedList<string>();

  testLength() {
    this.t.clear();
    this.areIdentical(0, this.t.length);
    this.t.push(10, "A");
    this.areIdentical(1, this.t.length);
    this.t.push(20, "B");
    this.t.push(30, "C");
    this.areIdentical(3, this.t.length);
  }

  testIsEmpty() {
    this.t.clear();
    this.isTrue(this.t.isEmpty);
    this.t.push(10, "A");
    this.isFalse(this.t.isEmpty);
  }

  testGet() {
    this.t.clear();
    this.areIdentical(null, this.t.get(0));
    this.t.push(10, "A");
    this.areIdentical(10, this.t.getTS(0));
  }

  setUp() {
    this.t.clear();
    this.t.push(1, "1");
    this.t.push(5, "5");
    this.t.push(8, "8");
    this.t.push(9, "9");
    this.t.push(15, "15");
  }

  testFloor() {
    this.isFalsey(this.t.floor(0));
    this.areIdentical(1, this.t.floor(1).ts);
    this.areIdentical(1, this.t.floor(2).ts);
    this.areIdentical(5, this.t.floor(5).ts);
    this.areIdentical(5, this.t.floor(6).ts);
    this.areIdentical(8, this.t.floor(8).ts);
    this.areIdentical(9, this.t.floor(9).ts);
    this.areIdentical(15, this.t.floor(20).ts);
  }

  testCeiling() {
    this.areIdentical(1, this.t.ceiling(0).ts);
    this.areIdentical(1, this.t.ceiling(1).ts);
    this.areIdentical(5, this.t.ceiling(2).ts);
    this.areIdentical(5, this.t.ceiling(5).ts);
    this.areIdentical(8, this.t.ceiling(6).ts);
    this.areIdentical(8, this.t.ceiling(8).ts);
    this.areIdentical(9, this.t.ceiling(9).ts);
    this.areIdentical(15, this.t.ceiling(11).ts);
    this.isFalsey(this.t.ceiling(20));
  }

  testList() {
    /*sameArrays(this, [null, null, null, null], this.t.values(-3, 0, 1));
    sameArrays(this, [null, null, null, "1"], this.t.values(-2, 1, 1));
    sameArrays(this, [null, null, "1", "1"], this.t.values(-1, 2, 1));
    sameArrays(this, [null, null, "1", null], this.t.values(-1, 2, 1,false));
    sameArrays(this, [null, "1", "1", "1"], this.t.values(0, 3, 1));
    sameArrays(this, [null, "1", null,null], this.t.values(0, 3, 1,false));
    sameArrays(this, ["1", "1", "1", "1"], this.t.values(1, 4, 1));
    sameArrays(this, ["1", null, null, null], this.t.values(1, 4, 1,false));
    sameArrays(this, ["1", "1", "1", "1","5"], this.t.values(1, 5, 1));
    sameArrays(this, ["1", null, null, null,"5"], this.t.values(1, 5, 1,false));
    sameArrays(this, ["1", "1", "1", "5","5"], this.t.values(2, 6, 1));
    sameArrays(this, [null, null, null, "5",null], this.t.values(2, 6, 1,false));
    sameArrays(this, ["1","5","8","9"], this.t.values(4, 10, 2));
    sameArrays(this, [null,"5","8","9"], this.t.values(4, 10, 2,false));
    sameArrays(this, ["15","15","15","15","15"], this.t.values(16, 20, 1));
    sameArrays(this, [null,null,null,null,null], this.t.values(16, 20, 1,false));
    sameArrays(this, ["15",null,null,null,null], this.t.values(15, 19, 1,false));

    sameArrays(this, [null, "1", "1", "1", "1", "5"], this.t.values(0, 5, 1));
    sameArrays(this, [null, "1", "1", "1", "1", "5", "5", "5", "8", "9", "9", "9", "9", "9", "9", "15", "15", "15"], this.t.values(0, 17, 1));
    sameArrays(this, [null, "1", "1", "5", "8", "9", "9", "9", "15"], this.t.values(0, 17, 2));
    sameArrays(this, [null, "1", "8", "9", "15"], this.t.values(0, 17, 4));
    */
  }

  testFrequencies() {
    /*
    sameArrays(this, [0, 1], this.t.frequencies(0, 1, 1));
    sameArrays(this, [0, 1, 0, 0, 0, 1], this.t.frequencies(0, 5, 1));
    sameArrays(this, [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0], this.t.frequencies(0, 17, 1));
    sameArrays(this, [0, 1, 0, 1, 1, 1, 0, 0, 1], this.t.frequencies(0, 17, 2));
    sameArrays(this, [0, 1, 2, 1, 1], this.t.frequencies(0, 17, 4));
    */
  }

  testFrequencyList() {
    //TODO
  }
}
