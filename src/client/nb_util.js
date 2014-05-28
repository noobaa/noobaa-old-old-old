'use strict';

var _ = require('underscore');
var moment = require('moment');

angular.module('templates', []);
// require('../../build/templates.js');

var nb_util = angular.module('nb_util', [
    'templates'
]);

// initializations - setup functions on globalScope
// which will be propagated to any other scope, and easily visible

nb_util.run(['$rootScope',
    function($rootScope) {
        $rootScope.safe_apply = safe_apply;
        $rootScope.safe_callback = safe_callback;
        $rootScope.human_size = human_size;
        $rootScope.mobile_check = mobile_check;

        jQuery.fn.focusWithoutScrolling = function() {
            var x = window.scrollX;
            var y = window.scrollY;
            this.focus();
            window.scrollTo(x, y);
        };

        $('body').tooltip({
            selector: '[rel=tooltip]'
        });

        $('body').popover({
            selector: '[rel=popover]'
        });
    }
]);



nb_util.factory('nbUtil', [
    '$http', '$timeout', '$interval', '$window', '$q', '$rootScope', '$compile', '$templateCache',
    function($http, $timeout, $interval, $window, $q, $rootScope, $compile, $templateCache) {

        var $scope = {
            bowser: require('bowser'),
            underscore: require('underscore'),
            moment: require('moment'),
            active_link: active_link,
            make_modal: make_modal,
            track_event: track_event,
            icon_by_kind: icon_by_kind,
            coming_soon: function(feature) {
                // TODO send event log
                alert('Coming soon...');
            }
        };


        function active_link(link) {
            return link === $window.location.pathname.substring(0, link.length) ? 'active' : '';
        }

        function make_modal(opt) {
            var html = opt.html || $templateCache.get(opt.template);
            var scope = opt.scope || $rootScope.$new();
            var e = $compile(html)(scope);
            e.addClass('animated fadeInDown');
            // close modal on ESC key
            $(window).off('keydown.nbutil_modal').on('keydown.nbutil_modal', function(event) {
                if (event.which === 27 && !event.isDefaultPrevented()) {
                    event.preventDefault();
                    e.modal('hide');
                }
            });
            e.on('hidden.bs.modal', function() {
                $(window).off('keydown.nbutil_modal');
                if (!opt.persist) {
                    e.remove();
                }
                $rootScope.safe_apply();
            });
            if (opt.size === 'lg') {
                e.find('.modal-dialog').addClass('modal-lg');
            } else if (opt.size === 'sm') {
                e.find('.modal-dialog').addClass('modal-sm');
            } else if (opt.size === 'fullscreen') {
                e.find('.modal-dialog').css({
                    position: 'absolute',
                    left: 30,
                    right: 30,
                    top: 30,
                    width: 'auto',
                    height: 'auto',
                    margin: '0 0 30px 0'
                });
            }
            e.modal({
                show: !opt.noshow
            });
            return e;
        }


        function track_event(event, data) {
            var p1 = $q.when().then(function() {
                if (!window.nb_mixpanel) {
                    return;
                }
                var deferred = $q.defer();
                var done = false;
                mixpanel.track(event, data, function() {
                    if (!done) {
                        deferred.resolve();
                        done = true;
                    }
                });
                $timeout(function() {
                    if (!done) {
                        console.error('MIXPANEL TIMEOUT');
                        deferred.reject();
                        done = true;
                    }
                }, 5000);
                return deferred.promise;
            });
            var p2 = $http({
                method: 'POST',
                url: '/track/',
                data: {
                    event: event,
                    data: data
                }
            });
            return $q.all([p1, p2]).then(function() {
                // console.log('TRACK', event);
            }, function(err) {
                console.error('FAILED TRACK EVENT', err);
                // don't propagate
            });
        }

        var ICONS_BY_KIND = {
            dir: 'folder-open',
            video: 'video-camera',
            audio: 'music',
            image: 'picture-o',
            text: 'file-text-o',
        };

        function icon_by_kind(kind) {
            return ICONS_BY_KIND[kind] || 'file';
        }

        return $scope;

    }
]);


nb_util.factory('nbMultiSelect', [
    '$http', '$timeout', '$interval', '$q', '$rootScope',
    function($http, $timeout, $interval, $q, $rootScope) {

        var $scope = {
            add_selection: add_selection,
            remove_selection: remove_selection,
            reset_selection: reset_selection,
            select_item: select_item,
            selection_items: selection_items,
        };


        function add_selection(selection, item, index) {
            if (item.is_selected) {
                return;
            }
            selection.items.push(item);
            item.is_selected = true;
            item.select_source_index = index;
        }

        function remove_selection(selection, item) {
            if (!item.is_selected) {
                return;
            }
            var pos = selection.items.indexOf(item);
            if (pos >= 0) {
                selection.items.splice(pos, 1);
            }
            item.is_selected = false;
            item.select_source_index = null;
        }

        function reset_selection(selection) {
            var items = selection.items;
            selection.items = [];
            if (!items) {
                return;
            }
            for (var i = 0; i < items.length; i++) {
                remove_selection(selection, items[i]);
            }
        }

        function select_item(selection, item, index, event) {
            if (event.ctrlKey || event.metaKey ||
                (selection.items.length === 1 && selection.items[0] === item)) {
                // console.log('SELECT TOGGLE', item.name, item.is_selected);
                if (item.is_selected) {
                    remove_selection(selection, item);
                    return false;
                } else {
                    add_selection(selection, item, index);
                }
            } else if (event.shiftKey && selection.items.length) {
                var from = selection.items[selection.items.length - 1].select_source_index;
                // console.log('SELECT FROM', from, 'TO', index);
                var i;
                if (index >= from) {
                    for (i = from; i <= index; i++) {
                        add_selection(selection, selection.source_index(i), i);
                    }
                } else {
                    for (i = from; i >= index; i--) {
                        add_selection(selection, selection.source_index(i), i);
                    }
                }
            } else {
                // console.log('SELECT ONE', item.name);
                reset_selection(selection);
                add_selection(selection, item, index);
            }
            return true;
        }

        function selection_items(selection) {
            return selection.items.slice(0); // make copy of array
        }


        return $scope;

    }
]);


// http wrapper to be used with async library
nb_util.factory('$http_async', ['$http',
    function($http) {
        return function(req, callback) {
            return $http(req).then(function(data) {
                callback(null, data);
            }, function(err) {
                callback(err);
            });
        };
    }
]);

nb_util.directive('nbVideo', ['$parse', '$timeout',
    function($parse, $timeout) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                var content_type = attr.nbVideo;
                console.log('VIDEO TYPE', content_type);
                if (content_type === 'video/x-matroska') {
                    return;
                }
                $timeout(function() {
                    element.addClass('video-js');
                    element.addClass('vjs-default-skin');
                    videojs(element[0], {
                        width: 'auto',
                        height: 'auto',
                    }, function() {
                        // Player (this) is initialized and ready.
                        this.play();
                    });
                }, 1);
            }
        };
    }
]);

nb_util.directive('nbXfbml', ['$parse',
    function($parse) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                var opt = scope.$eval(attr.nbXfbml);
                if (opt) {
                    _.each(opt, function(value, key) {
                        element.attr(key, value);
                    });
                }
                if (typeof FB !== 'undefined') {
                    FB.XFBML.parse(element.parent()[0]);
                }
            }
        };
    }
]);

nb_util.directive('nbEvents', ['$parse',
    function($parse) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                var events = scope.$eval(attr.nbEvents) || {};
                for (var e in events) {
                    $(element).on(e, events[e]);
                }
            }
        };
    }
]);

nb_util.directive('nbFocus', function() {
    return {
        restrict: 'A', // use as attribute
        link: function(scope, element, attr) {
            scope.$watch(attr.nbFocus, function(val) {
                if (val) {
                    element.focus();
                }
            }, true);
        }
    };
});

nb_util.directive('nbAutoHeight', ['$timeout',
    function($timeout) {
        function update_height(e, min) {
            e.height(0);
            var height = e[0].scrollHeight;
            if (height < min) {
                height = min;
            }
            e.height(height);
            e.focus();
        }
        return {
            restrict: 'A',
            link: function(scope, element, attr) {
                var e = $(element);
                var tmp = e.val();
                e.val('');
                e.height(0);
                var min = e[0].scrollHeight;
                e.val(tmp);
                tmp = null;
                element.bind('keydown', function(event) {
                    update_height($(event.target), min);
                });
                // Expand as soon as it is added to the DOM
                $timeout(function() {
                    update_height(e, min);
                }, 0);
            }
        };
    }
]);

nb_util.directive('nbRightClick', ['$parse',
    function($parse) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                var fn = $parse(attr.nbRightClick);
                element.bind('contextmenu', function(event) {
                    event.preventDefault();
                    scope.$apply(function() {
                        fn(scope, {
                            $event: event
                        });
                    });
                    return false;
                });
            }
        };
    }
]);

nb_util.directive('nbEnter', function() {
    return function(scope, element, attrs) {
        element.bind("keydown keypress", function(event) {
            if (event.which === 13 && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                scope.$apply(function() {
                    scope.$eval(attrs.nbEnter);
                });
                event.preventDefault();
            }
        });
    };
});

nb_util.directive('nbResizable', function() {
    return {
        restrict: 'A', // use as attribute
        link: function(scope, element, attr) {
            element.resizable();
        }
    };
});

nb_util.directive('nbTooltip', function() {
    return {
        restrict: 'A', // use as attribute
        link: function(scope, element, attr) {
            scope.$watch(attr.nbTooltip, function(value) {
                element.tooltip(value);
            });
            $(element).on('remove', function() {
                element.tooltip('destroy');
            });
        }
    };
});

nb_util.directive('nbPopover', [
    '$compile', '$rootScope', '$timeout',
    function($compile, $rootScope, $timeout) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                var opt = scope.$eval(attr.nbPopover);
                var opt_element = opt.element;
                delete opt.element;
                opt.trigger = 'manual';
                if (opt_element) {
                    opt.content = $compile($(opt_element).html())(scope);
                    opt.html = true;
                }
                element.popover(opt);
                var pop_timeout;
                var pop_shown;
                $(element).add(opt.content).on('mouseenter', function(e) {
                    $timeout.cancel(pop_timeout);
                    if (!pop_shown) {
                        pop_shown = true;
                        element.popover('show');
                    }
                }).on('mouseleave', function(e) {
                    $timeout.cancel(pop_timeout);
                    pop_timeout = $timeout(function() {
                        pop_shown = false;
                        element.popover('hide');
                    }, 500);
                });
            }
        };
    }
]);

nb_util.directive('nbKey', ['$parse',
    function($parse) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                var fn = $parse(attr.nbKey);
                // element.bind('keydown', handler);
                $(document).on('keydown', function(event) {
                    return scope.$apply(function() {
                        return fn(scope, {
                            $event: event
                        });
                    });
                });
            }
        };
    }
]);

nb_util.directive('nbDrop', ['$parse', '$rootScope',
    function($parse, $rootScope) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                scope.$watch(attr.nbDrop, function(value) {
                    var obj = scope.$eval(attr.nbDrop);
                    if (!obj && element && element.data('droppable')) {
                        element.droppable("destroy");
                        return;
                    }
                    element.droppable({
                        greedy: true, //greedy and hoverclass combination seems a bit buggy
                        accept: '.nbdrag',
                        tolerance: 'pointer',
                        hoverClass: 'drop_hover_class',
                        drop: function(event, ui) {
                            var nbobj = $(ui.draggable).data('nbobj');
                            scope.$apply(function() {
                                obj.handle_drop(nbobj);
                            });
                        },
                        over: function(event, ui) {
                            scope.handle_drop_over(event, ui, obj);
                        },
                        out: function(event, ui) {
                            scope.handle_drop_out(event, ui, obj);
                        }
                    });
                });
            }
        };
    }
]);

// TODO: how to cancel drag on escape ??
// var escape_count = 0;
// $(window).keyup(function(e) {
// if (e.which == 27) {
// escape_count++;
// console.log('ESCAPE', escape_count);
// }
// });

nb_util.directive('nbDrag', ['$parse', '$rootScope',
    function($parse, $rootScope) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                var obj = scope.$eval(attr.nbDrag);
                element.draggable({
                    refreshPositions: true, // bad for perf but needed for expanding dirs
                    revert: "invalid",
                    cursor: "move",
                    cursorAt: {
                        top: 0,
                        left: 0
                    },
                    distance: 10,
                    helper: obj.get_drag_helper.bind(obj) || 'clone',
                    start: function(event) {
                        $(this).data('nbobj', obj);
                        // $(this).data('escape_count', escape_count);
                    }
                });
            }
        };
    }
]);

nb_util.directive('nbEffectToggle', ['$timeout',
    function($timeout) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attrs) {
                var opt = scope.$eval(attrs.nbEffectOptions);
                var jqelement = angular.element(element);
                var last = {};
                scope.$watch(attrs.nbEffectToggle, function(value) {
                    if (last.value === undefined) {
                        if (value) {
                            jqelement.show();
                        } else {
                            jqelement.hide();
                        }
                        last.value = value;
                    } else if (last.value !== value) {
                        last.value = value;
                        if (value) {
                            jqelement.show(opt);
                        } else {
                            jqelement.hide(opt);
                        }
                    }
                });
            }
        };
    }
]);

nb_util.directive('nbEffectSwitchClass', ['$parse',
    function($parse) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attrs) {
                var opt = scope.$eval(attrs.nbEffectOptions);
                var jqelement = angular.element(element);
                if (opt.complete) {
                    var complete_apply = function() {
                        scope.safe_apply(opt.complete);
                    };
                }
                var first = true;
                scope.$watch(attrs.nbEffectSwitchClass, function(value) {
                    var duration = opt.duration;
                    if (first) {
                        first = false;
                        duration = 0;
                    }
                    if (value) {
                        jqelement.switchClass(
                            opt.from, opt.to,
                            duration, opt.easing, complete_apply);
                    } else {
                        jqelement.switchClass(
                            opt.to, opt.from,
                            duration, opt.easing, complete_apply);
                    }
                });
            }
        };
    }
]);

nb_util.directive('nbShine', ['$parse',
    function($parse) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                var options = scope.$eval(attr.nbShine) || {};
                var opt = angular.extend({
                    at: 'center', // position in the element, e.g. at: "25% 40%"
                    thick: 20, // pixels
                    color: 'rgba(255,255,255,0.85)',
                    start: 0, // pixel start radius
                    end: 100, // pixel end radius
                    step: 0.01, // step fraction (0-1)
                    step_time: 10, // milis between steps
                    delay: 10000 // milis between shines
                }, options);
                var pixel_step = opt.step * (opt.end - opt.start);
                var pixel_thick = opt.thick / 2;
                var R = opt.start;
                var template = 'radial-gradient(' +
                    'circle at ' + opt.at +
                    ', transparent XXXpx' +
                    ', ' + opt.color + ' YYYpx' +
                    ', transparent ZZZpx)';
                var renderer = function() {
                    var z = R;
                    var y = z - pixel_thick;
                    var x = y - pixel_thick;
                    var s = template;
                    s = s.replace('XXX', x);
                    s = s.replace('YYY', y);
                    s = s.replace('ZZZ', z);
                    element.css('background-image', s);
                    R += pixel_step;
                    if ((pixel_step > 0 && R > opt.end) ||
                        (pixel_step < 0 && R < opt.end)) {
                        R = opt.start;
                        element.css('background-image', '');
                        setTimeout(renderer, opt.delay);
                    } else {
                        setTimeout(renderer, opt.step_time);
                    }
                };
                setTimeout(renderer, opt.delay);
            }
        };
    }
]);


nb_util.factory('LinkedList', function() {
    return LinkedList;
});

function LinkedList(name) {
    name = name || '';
    this.next = '_lln_' + name;
    this.prev = '_llp_' + name;
    this.head = '_llh_' + name;
    this.length = 0;
    this[this.next] = this;
    this[this.prev] = this;
    this[this.head] = this;
}
LinkedList.prototype.get_next = function(item) {
    var next = item[this.next];
    return next === this ? null : next;
};
LinkedList.prototype.get_prev = function(item) {
    var prev = item[this.prev];
    return prev === this ? null : prev;
};
LinkedList.prototype.get_front = function() {
    return this.get_next(this);
};
LinkedList.prototype.get_back = function() {
    return this.get_prev(this);
};
LinkedList.prototype.is_empty = function() {
    return !this.get_front();
};
LinkedList.prototype.insert_after = function(item, new_item) {
    if (item[this.head] !== this) {
        return false;
    }
    var next = item[this.next];
    new_item[this.next] = next;
    new_item[this.prev] = item;
    next[this.prev] = new_item;
    item[this.next] = new_item;
    this.length++;
    return true;
};
LinkedList.prototype.insert_before = function(item, new_item) {
    if (item[this.head] !== this) {
        return false;
    }
    var prev = item[this.prev];
    new_item[this.next] = item;
    new_item[this.prev] = prev;
    new_item[this.head] = this;
    prev[this.next] = new_item;
    item[this.prev] = new_item;
    this.length++;
    return true;
};
LinkedList.prototype.remove = function(item) {
    if (item[this.head] !== this) {
        return false;
    }
    var next = item[this.next];
    var prev = item[this.prev];
    if (!next || !prev) {
        return false; // already removed
    }
    next[this.prev] = prev;
    prev[this.next] = next;
    item[this.next] = null;
    item[this.prev] = null;
    item[this.head] = null;
    this.length--;
    return true;
};
LinkedList.prototype.push_front = function(item) {
    return this.insert_after(this, item);
};
LinkedList.prototype.push_back = function(item) {
    return this.insert_before(this, item);
};
LinkedList.prototype.pop_front = function() {
    var item = this.get_front();
    if (item) {
        this.remove(item);
        return item;
    }
};
LinkedList.prototype.pop_back = function() {
    var item = this.get_back();
    if (item) {
        this.remove(item);
        return item;
    }
};


nb_util.factory('JobQueue', ['$timeout',
    function($timeout) {
        return JobQueue.bind(JobQueue, $timeout);
    }
]);

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


// safe apply handles cases when apply may fail with:
// "$apply already in progress" error

function safe_apply(func) {
    /* jshint validthis:true */
    var phase = this.$root.$$phase;
    if (phase == '$apply' || phase == '$digest') {
        return this.$eval(func);
    } else {
        return this.$apply(func);
    }
}

// safe_callback returns a function callback that performs the safe_apply
// while propagating arguments to the given func.

function safe_callback(func) {
    /* jshint validthis:true */
    var me = this;
    return function() {
        // build the args array to have null for 'this' 
        // and rest is taken from the callback arguments
        var args = new Array(arguments.length + 1);
        args[0] = null;
        for (var i = 0; i < arguments.length; i++) {
            args[i + 1] = arguments[i];
        }
        // the following is in fact calling func.bind(null, a1, a2, ...)
        var fn = Function.prototype.bind.apply(func, args);
        return me.safe_apply(fn);
    };
}

function human_size(bytes) {
    var x = Number(bytes);
    if (isNaN(x)) {
        return '';
    }
    if (x < 1024) {
        return x + ' B';
    }
    x = x / 1024;
    if (x < 1024) {
        return x.toFixed(1) + ' KB';
    }
    x = x / 1024;
    if (x < 1024) {
        return x.toFixed(1) + ' MB';
    }
    x = x / 1024;
    if (x < 1024) {
        return x.toFixed(1) + ' GB';
    }
    x = x / 1024;
    if (x < 1024) {
        return x.toFixed(1) + ' TB';
    }
    return x.toFixed(0) + ' TB';
}

// http://stackoverflow.com/questions/11381673/javascript-solution-to-detect-mobile-browser
// http://detectmobilebrowsers.com/

function mobile_check() {
    var a = navigator.userAgent || navigator.vendor || window.opera;
    if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(a) ||
        /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) {
        return true;
    }
    return false;
}
