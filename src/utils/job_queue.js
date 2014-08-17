'use strict';

var LinkedList = require('./linked_list');

module.exports = JobQueue;

// 'concurrency' with positive integer will do auto process with given concurrency level.
// use concurrency 0 for manual processing.
// 'delay' is number of milli-seconds between auto processing.
// name is optional in case multiple job queues (or linked lists) 
// are used on the same elements.

function JobQueue(timeout, concurrency, delay, name, method) {
    this.timeout = timeout || setTimeout;
    this.concurrency = concurrency || (concurrency === 0 ? 0 : 1);
    this.delay = delay || 0;
    this.method = method || 'run';
    this._queue = new LinkedList(name);
    this._num_running = 0;
    Object.defineProperty(this, 'length', {
        enumerable: true,
        get: function() {
            return this._queue.length;
        }
    });
}

// add the given function to the jobs queue
// which will run it when time comes.
// job have its method property (by default 'run').
JobQueue.prototype.add = function(job) {
    this._queue.push_back(job);
    this.process(true);
};

JobQueue.prototype.remove = function(job) {
    return this._queue.remove(job);
};

JobQueue.prototype.process = function(check_concurrency) {
    var me = this;
    if (check_concurrency && me._num_running >= me.concurrency) {
        return;
    }
    if (me._queue.is_empty()) {
        return;
    }
    var job = me._queue.pop_front();
    me._num_running++;
    var end = function() {
        me._num_running--;
        me.process(true);
    };
    // submit the job to run in background 
    // to be able to return here immediately
    me.timeout(function() {
        try {
            var promise = job[me.method]();
            if (!promise || !promise.then) {
                end();
            } else {
                promise.then(end, end);
            }
        } catch (err) {
            console.error('UNCAUGHT EXCEPTION', err, err.stack);
            end();
        }
    }, me.delay);
};
