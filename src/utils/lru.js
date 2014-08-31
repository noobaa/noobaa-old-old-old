'use strict';

var LinkedList = require('./linked_list');

module.exports = LRU;

function LRU(max_length, name) {
    this.max_length = max_length || 32;
    this.list = new LinkedList(name);
    this.map = {};
}

// return the item from the LRU cache, create it if missing.
LRU.prototype.find_or_add_item = function(id) {
    var item = this.map[id];
    if (!item) {
        // make room for 1 new item
        this._remove_items_to_make_room(1);
        // miss - insert new item on front
        item = {
            id: id
        };
        this.map[id] = item;
        this.list.push_front(item);
    } else {
        // make room for 0 new items - just to keep the length controlled
        this._remove_items_to_make_room(0);
        // hit - move to front to mark as recently used
        this.list.remove(item);
        this.list.push_front(item);
    }
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
