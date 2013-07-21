/*jshint browser:true, jquery:true, devel:true */
/*global angular:false */

// declare our module with dependancy on the angular-ui module
var noobaa_app = angular.module('noobaa_app', ['ui']);

// set the symbol to avoid collision with server side templates (jinja)
noobaa_app.config(function($interpolateProvider) {
	$interpolateProvider.startSymbol('[[[');
	$interpolateProvider.endSymbol(']]]');
});

// safe apply handles cases when apply may fail with:
// "$apply already in progress" error

function safe_apply(scope, fn, args) {
	var call_expr = function(scope) {
		if (!fn) {
			return;
		}
		fn.apply(null, args);
	};
	var phase = scope.$root.$$phase;
	if (phase == '$apply' || phase == '$digest') {
		return scope.$eval(call_expr);
	} else {
		return scope.$apply(call_expr);
	}
}

function human_size(bytes) {
	var units = ['', ' KB', ' MB', ' GB', ' TB'];
	for (var u = 0; u < units.length && bytes >> 10 > 0; u++) {
		bytes = bytes >> 10;
	}
	return String(bytes) + units[u];
}

// initializations
noobaa_app.run(function($rootScope) {
	$rootScope.human_size = human_size;
});

noobaa_app.service('$safe', function() {
	// $safe.$apply makes the apply call
	this.$apply = safe_apply;
	// $safe.$callback returns a function callback that performs the safe apply
	this.$callback = function(scope, fn) {
		return function() {
			var args = Array.prototype.slice.call(arguments);
			return safe_apply(scope, fn, args);
		};
	};
});

noobaa_app.directive('nbRightClick', function($parse) {
	return {
		restrict: 'A',
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
});

noobaa_app.directive('nbDrop', function($parse, $rootScope) {
	return {
		restrict: 'A',
		link: function(scope, element, attr) {
			var fn = $parse(attr.nbDrop);
			var handler = function(event) {
				event.preventDefault();
				return scope.$apply(function() {
					fn(scope, {
						$event: event,
						$drag: $rootScope.nbdrag
					});
				});
			};
			element[0].ondragenter = handler;
			element[0].ondragover = handler;
			element[0].ondragleave = handler;
			element[0].ondrop = handler;
		}
	};
});

noobaa_app.directive('nbDrag', function($parse, $rootScope) {
	return {
		restrict: 'A',
		link: function(scope, element, attr) {
			var fn = $parse(attr.nbDrag);
			element[0].draggable = true;
			element[0].ondragstart = function(event) {
				var dragee = scope.$apply(function() {
					return fn(scope, {
						$event: event
					});
				});
				$rootScope.nbdrag = dragee;
				event.dataTransfer.setData('text/html', null);
				event.dataTransfer.dropEffect = 'copy';
			};
			element[0].ondragend = function(event) {
				var dragee = scope.$apply(function() {
					return fn(scope, {
						$event: event
					});
				});
				delete $rootScope.nbdrag;
			};
		}
	};
});

noobaa_app.directive('nbEffectToggle', ['$timeout',
	function($timeout) {
		return {
			restrict: 'A',
			link: function(scope, element, attrs) {
				var opt = scope.$eval(attrs.nbEffectOptions);
				if (opt.complete) {
					opt.complete = function() {
						safe_apply(scope, opt.complete);
					};
				}
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
						jqelement.toggle(opt);
						last.value = value;
					}
				});
			}
		};
	}
]);

noobaa_app.directive('nbEffectSwitchClass', function($parse) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var opt = scope.$eval(attrs.nbEffectOptions);
			var jqelement = angular.element(element);
			if (opt.complete) {
				var complete_apply = function() {
					safe_apply(scope, opt.complete);
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
});