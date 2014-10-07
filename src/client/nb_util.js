'use strict';

var _ = require('underscore');
var util = require('util');
var moment = require('moment');
var LinkedList = require('noobaa-util/linked_list');
var JobQueue = require('noobaa-util/job_queue');

angular.module('templates', []);
// require('../../build/templates.js');

var nb_util = angular.module('nb_util', [
    'templates', 'ngCookies'
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
    '$http', '$timeout', '$interval', '$window', '$location', '$q', '$rootScope', '$compile', '$templateCache', '$cookies',
    function($http, $timeout, $interval, $window, $location, $q, $rootScope, $compile, $templateCache, $cookies) {

        var $scope = {
            bowser: require('bowser'),
            underscore: require('underscore'),
            moment: require('moment'),
            active_link: active_link,
            make_modal: make_modal,
            modal_body_wrap: modal_body_wrap,
            track_event: track_event,
            icon_by_kind: icon_by_kind,
            order_by_kind: order_by_kind,
            valid_email: valid_email,
            stop_event: stop_event,
            coming_soon: coming_soon,
        };


        function active_link(link) {
            return link === $window.location.pathname.substring(0, link.length) ? 'active' : '';
        }

        function make_modal(opt) {
            var html = opt.html || $templateCache.get(opt.template);
            var scope = opt.scope || $rootScope.$new();
            var e = $compile(html)(scope);
            e.addClass('activity-animate');
            // close modal on ESC key
            $(window).off('keydown.nbutil_modal').on('keydown.nbutil_modal', function(event) {
                if (event.which === 27 && !event.isDefaultPrevented()) {
                    event.preventDefault();
                    e.modal('hide');
                }
            });
            // close modal on mobile back key or browser history back
            var back_unsubscribe;
            e.on('shown.bs.modal', function() {
                back_unsubscribe = scope.$on('$locationChangeStart', function(event) {
                    e.modal('hide');
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                });
            });
            e.on('hidden.bs.modal', function() {
                if (back_unsubscribe) {
                    back_unsubscribe();
                }
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
                e.addClass('modal-fullscreen');
            }
            e.modal({
                show: !opt.noshow
            });
            return e;
        }

        function modal_body_wrap(opt) {
            return [
                '<div class="modal"',
                opt.controller ? ' ng-controller="' + opt.controller + '"' : '',
                '>',
                '<div class="modal-dialog">',
                '<div class="modal-content">',
                '<div class="modal-body" style="padding: 0">',
                $templateCache.get(opt.template),
                '</div>',
                '</div>',
                '</div>',
                '</div>'
            ].join('\n');
        }

        function track_event(event, data) {
            data = data || {};
            if ($cookies.utm_id) {
                data.utm_id = $cookies.utm_id;
            }
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
            dir: 'fa-folder-open-o',
            image: 'fa-picture-o',
            video: 'fa-play', // 'fa-film',
            audio: 'fa-music',
            text: 'fa-file-text-o',
        };
        var ORDER_BY_KIND = {
            dir: 1,
            image: 2,
            video: 3,
            audio: 4,
            text: 5,
        };

        function icon_by_kind(kind) {
            return ICONS_BY_KIND[kind] || 'fa-file-o';
        }

        function order_by_kind(kind) {
            return ORDER_BY_KIND[kind] || 9;
        }

        var EMAIL_REGEX = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

        function valid_email(email) {
            return EMAIL_REGEX.test(email);
        }

        function stop_event(event) {
            if (event.stopPropagation) {
                event.stopPropagation();
            }
            return false;
        }

        function coming_soon(description, event_name) {
            alertify.log('Coming soon - ' + description);
            if (event_name) {
                track_event('coming_soon.' + event_name);
            }
        }

        /*
        function set_content_template(opt) {
            var html = opt.html || $templateCache.get(opt.template);
            var scope = opt.scope || $rootScope.$new();
            $scope.content[opt.name] = $compile(html)(scope);
        }
        */

        return $scope;

    }
]);


nb_util.factory('nbMultiSelect', [
    '$http', '$timeout', '$interval', '$q', '$rootScope',
    function($http, $timeout, $interval, $q, $rootScope) {

        function MultiSelect(get_item_by_index_fn) {
            this._items = {};
            this._count = 0;
            this._current_item = null;
            this._current_index = -1;
            this.get_item_by_index = get_item_by_index_fn;
        }

        MultiSelect.prototype.is_selected = function(item) {
            return this._items[item.id];
        };

        MultiSelect.prototype.is_empty = function() {
            return _.isEmpty(this._items);
        };

        MultiSelect.prototype.get_items = function() {
            return _.values(this._items);
        };

        MultiSelect.prototype.get_count = function() {
            return this._count;
        };

        MultiSelect.prototype.get_current = function() {
            return this._current_item;
        };

        MultiSelect.prototype.get_candidate = function() {
            // _.find without a predicate just returns the first value it encounters
            var candidate = _.find(this._items);
            return candidate;
        };

        MultiSelect.prototype.foreach = function(fn) {
            // find will break once the call to fn will return true
            _.find(this._items, function(item) {
                return fn(item);
            });
        };

        MultiSelect.prototype.reset = function() {
            this._items = {};
            this._count = 0;
            this.reset_current();
        };

        MultiSelect.prototype.reset_current = function() {
            this._current_item = null;
            this._current_index = -1;
        };

        MultiSelect.prototype.add = function(item, index) {
            if (!this._items[item.id]) {
                this._items[item.id] = item;
                this._count++;
            }
            this._current_item = item;
            this._current_index = index;
        };

        MultiSelect.prototype.remove = function(item) {
            if (this._items[item.id]) {
                delete this._items[item.id];
                this._count--;
            }
            this.reset_current();
        };

        MultiSelect.prototype.select = function(item, index, op) {
            if (op === 'single') {
                // console.log('SELECT ONE', item.name);
                this.reset();
                this.add(item, index);
                return true;
            }
            if (op === 'range' && this._current_index >= 0) {
                var from = this._current_index;
                // console.log('SELECT FROM', from, 'TO', index);
                var i;
                if (index >= from) {
                    for (i = from; i <= index; i++) {
                        this.add(this.get_item_by_index(i), i);
                    }
                } else {
                    for (i = from; i >= index; i--) {
                        this.add(this.get_item_by_index(i), i);
                    }
                }
                return true;
            }
            // console.log('SELECT TOGGLE', item.name, item.is_selected);
            if (this.is_selected(item)) {
                this.remove(item);
                return false;
            } else {
                this.add(item, index);
                return true;
            }
        };

        return {
            Class: MultiSelect
        };
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

// the $timeonce service takes a function, and returns a wrapper function,
// such that calls to the wrapper will be executed on timeout,
// and if called more than once during the timeout period, it will only run once.
nb_util.factory('$timeonce', ['$timeout',
    function($timeout) {
        return function(func, time) {
            time = time || 0;
            var timer;
            var once = function() {
                if (timer) {
                    return;
                }
                var args = arguments;
                timer = $timeout(function() {
                    timer = null;
                    func.apply(null, args);
                }, time);
            };
            once.cancel = function() {
                $timeout.cancel(timer);
                timer = null;
            };
            return once;
        };
    }
]);

/**
 * Return the DOM siblings between the first and last node in the given array.
 * @param {Array} array like object
 * @returns {DOMElement} object containing the elements
 */

function getBlockElements(nodes) {
    var startNode = nodes[0],
        endNode = nodes[nodes.length - 1];
    if (startNode === endNode) {
        return $(startNode);
    }

    var element = startNode;
    var elements = [element];

    do {
        element = element.nextSibling;
        if (!element) break;
        elements.push(element);
    } while (element !== endNode);

    return $(elements);
}

// just like ng-if but replaces the element
nb_util.directive('nbIfReplace', ['$animate',
    function($animate) {
        return {
            transclude: true,
            priority: 600,
            terminal: true,
            restrict: 'A',
            $$tlb: true,
            link: function($scope, $element, $attr, ctrl, $transclude) {
                var block, childScope, previousElements;
                $scope.$watch($attr.nbIfReplace, function ngIfWatchAction(value) {
                    var comment_element = $('<!-- nbIfReplace -->');
                    comment_element.insertAfter($element);
                    $element.remove();
                    $element = comment_element;
                    if (value) {
                        if (!childScope) {
                            $transclude(function(clone, newScope) {
                                childScope = newScope;
                                clone[clone.length++] = document.createComment(' end nbIfReplace: ' + $attr.nbIfReplace + ' ');
                                // Note: We only need the first/last node of the cloned nodes.
                                // However, we need to keep the reference to the jqlite wrapper as it might be changed later
                                // by a directive with templateUrl when its template arrives.
                                block = {
                                    clone: clone
                                };
                                $animate.enter(clone, $element.parent(), $element);
                            });
                        }
                    } else {
                        if (previousElements) {
                            previousElements.remove();
                            previousElements = null;
                        }
                        if (childScope) {
                            childScope.$destroy();
                            childScope = null;
                        }
                        if (block) {
                            previousElements = getBlockElements(block.clone);
                            $animate.leave(previousElements, function() {
                                previousElements = null;
                            });
                            block = null;
                        }
                    }
                });
            }
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
                if (scope.autoplay) {
                    element.attr('autoplay', 'autoplay');
                }
                if (content_type === 'video/x-matroska') {
                    return;
                }
                var player;
                var timer = $timeout(function() {
                    element.addClass('video-js');
                    element.addClass('vjs-default-skin');
                    player = videojs(element[0], {
                        width: 'auto',
                        height: 'auto',
                        autoplay: scope.autoplay,
                    });
                }, 1);

                function cleanup() {
                    $timeout.cancel(timer);
                    if (player && player.dispose) {
                        console.log('VIDEO DISPOSE');
                        // TODO not sure if should dispose the player, for now dont
                        // when calling dispose we get a repeating exception like: 
                        // Cannot read property 'vdata...' of null
                        // but not sure if this is enough to get rid of the player resources.
                        // player.dispose();
                        player = null;
                    }
                }
                scope.$on('$destroy', cleanup);
                element.on('remove', cleanup);
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
                _.each(events, function(val, key) {
                    $(element).on(key, scope.safe_callback(val));
                });
            }
        };
    }
]);

nb_util.directive('nbScrollIntoView', ['$timeout',
    function($timeout) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                if (!attr.nbScrollIntoView || scope.$eval(attr.nbScrollIntoView)) {
                    element.get(0).scrollIntoView();
                }
            }
        };
    }
]);

nb_util.directive('nbFocus', ['$timeout',
    function($timeout) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                scope.$watch(attr.nbFocus, function(val) {
                    // submit to allow elements to be added to dom if needed
                    $timeout(function() {
                        if (val) {
                            element.focus();
                        } else {
                            element.blur();
                        }
                    }, 0);
                }, true);
            }
        };
    }
]);

nb_util.directive('nbOnFocus', function() {
    return {
        restrict: 'A', // use as attribute
        link: function(scope, element, attr) {
            element.on('focus', function() {
                scope.safe_apply(function() {
                    scope.$eval(attr.nbOnFocus);
                });
            });
        }
    };
});

nb_util.directive('nbAutoHeight', ['$timeout',
    function($timeout) {
        function update_height(element, input, min) {
            element.height(input.outerHeight());
            input.height(0);
            var height = input[0].scrollHeight;
            if (height < min) {
                height = min;
            }
            input.height(height);
            element.height('auto');
            // e.parent().trigger('resize');
        }
        return {
            restrict: 'A',
            link: function(scope, element, attr) {
                var input = $(element).find('textarea, input');
                var tmp = input.val();
                input.val('');
                input.height(0);
                var min = input[0].scrollHeight;
                input.val(tmp);
                tmp = null;
                var update_timeout = null;
                var do_update = function() {
                    if (!update_timeout) {
                        update_timeout = $timeout(function() {
                            update_height(element, input, min);
                            update_timeout = null;
                        }, 0);
                    }
                };
                if (attr.nbAutoHeight) {
                    scope.$watch(attr.nbAutoHeight, do_update);
                } else {
                    // Update on relevant element events
                    input.on('keydown', do_update);
                    input.on('change', do_update);
                    input.on('focus', do_update);
                    input.on('blur', do_update);
                }
                // Update as soon as it is added to the DOM
                update_height(element, input, min);
                do_update();
            }
        };
    }
]);

nb_util.directive('nbFixedResize', ['$timeout', '$timeonce',
    function($timeout, $timeonce) {
        return {
            restrict: 'A',
            link: function(scope, element, attr) {
                var e = $(element);
                var scroll_target = $('body');
                var pad_type = attr.nbFixedResize;
                var old_pad = 0;
                var old_bottom = 0;

                function do_resize() {
                    // set the parent pad to element's height to make room for the fixed element
                    var pad = e.outerHeight();
                    if (pad !== old_pad) {
                        e.parent().css(pad_type, pad);
                    }
                    old_pad = pad;
                }

                var handler = $timeonce(do_resize);
                e.on('resize DOMNodeInserted DOMNodeRemoved', handler);
                $(window).on('resize', do_resize);
                handler(); // handle as soon as it is added to the DOM
            }
        };
    }
]);

nb_util.directive('nbScrollTo', ['$timeout', '$timeonce',
    function($timeout, $timeonce) {
        return {
            restrict: 'A',
            link: function(scope, element, attr) {
                var scroll_target = $('body');
                var to = attr.nbScrollTo;

                function do_scroll() {
                    scroll_target[0].scrollTop = (to === 'bottom') ?
                        scroll_target[0].scrollHeight : 0;
                }

                var handler = $timeonce(do_scroll, 5);
                handler(); // handle as soon as it is added to the DOM
                do_scroll();
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
                var always_show = (value.trigger === 'always');
                if (always_show) {
                    value.trigger = 'manual';
                }
                element.tooltip(value);
                if (always_show) {
                    element.tooltip('show');
                }
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
                var handler = function(event) {
                    return scope.$apply(function() {
                        return fn(scope, {
                            $event: event
                        });
                    });
                };
                $(document).on('keydown', handler);
                element.on('remove', function() {
                    $(document).off('keydown', handler);
                });
            }
        };
    }
]);

nb_util.directive('nbEscape', ['$parse',
    function($parse) {
        return {
            restrict: 'A', // use as attribute
            link: function(scope, element, attr) {
                var fn = $parse(attr.nbEscape);
                var handler = function(event) {
                    if (event.which !== 27) {
                        return;
                    }
                    return scope.$apply(function() {
                        return fn(scope, {
                            $event: event
                        });
                    });
                };
                $(document).on('keydown', handler);
                element.on('remove', function() {
                    $(document).off('keydown', handler);
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


nb_util.factory('JobQueue', ['$timeout',
    function($timeout) {
        // return here a JobQueue class suitable for angular usage
        // which means it uses the $timeout service.
        function AngularJobQueue(params) {
            JobQueue.call(this, _.defaults(params, {
                timeout: $timeout
            }));
        }
        util.inherits(AngularJobQueue, JobQueue);
        return AngularJobQueue;
    }
]);


// safe apply handles cases when apply may fail with:
// "$apply already in progress" error

function safe_apply(func) {
    /* jshint validthis:true */
    var phase = this.$root.$$phase;
    if (phase === '$apply' || phase === '$digest') {
        return this.$eval(func);
    } else {
        return this.$apply(func);
    }
}

// safe_callback returns a function callback that performs the safe_apply
// while propagating arguments to the given func.

function safe_callback(func) {
    /* jshint validthis:true */
    var self = this;
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
        return self.safe_apply(fn);
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
