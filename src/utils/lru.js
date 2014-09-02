'use strict';

var LinkedList = require('./linked_list');

module.exports = LRU;

function LRU(max_length, expiry_ms, name) {
    this.max_length = max_length || 32;
    this.expiry_ms = expiry_ms || 0;
    this.list = new LinkedList(name);
    this.map = {};
}

// return the item from the LRU cache, create it if missing.
LRU.prototype.find_or_add_item = function(id) {
    var item = this.map[id];
    var now = this.expiry_ms ? Date.now() : 0;
    if (item) {
        // check if not expired
        if (!this.expiry_ms || (now < item.time + this.expiry_ms)) {
            // hit - move to front to mark as recently used
            // make room for 0 new items - just to keep the length controlled
            this._remove_items_to_make_room(0);
            this.list.remove(item);
            this.list.push_front(item);
            return item;
        }
        // item expired
        this.list.remove(item);
        delete this.map[id];
    }
    // miss - insert new item on front
    item = {
        id: id,
        time: now,
    };
    // make room for 1 new item
    this._remove_items_to_make_room(1);
    this.map[id] = item;
    this.list.push_front(item);
    return item;
};

LRU.prototype.remove_item = function(id) {
    var item = this.map[id];
    if (!item) {
        return;
    }
    this.list.remove(item);
    delete this.map[id];
    return item;
};

// remove items as long as more than the maximum configured length
LRU.prototype._remove_items_to_make_room = function(count) {
    count = count || 0;
    while (this.list.length + count > this.max_length) {
        var item = this.list.pop_back();
        delete this.map[item.id];
    }
};
