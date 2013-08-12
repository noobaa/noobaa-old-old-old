/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */

(function(global) {
	'use strict';


	// declare our module with dependancy on the angular-ui module
	var noobaa_app = angular.module('noobaa_app', ['ui','ngGrid']);

	// set the symbol to avoid collision with server side templates (jinja)
	noobaa_app.config(function($interpolateProvider) {
		$interpolateProvider.startSymbol('{{');
		$interpolateProvider.endSymbol('}}');
	});

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
		var callback = function() {
			// when callback is called, it passes the sent args 
			// into the inner call to func inside safe_apply.
			var args = Array.prototype.slice.call(arguments);
			return this.safe_apply(function() {
				if (func) {
					func.apply(null, args);
				}
			});
		};
		// return callback bound to same this as current context
		return callback.bind(this);
	}

	function human_size(bytes) {
		var units = ['', ' KB', ' MB', ' GB', ' TB'];
		for (var u = 0; u < units.length && bytes >> 10 > 0; u++) {
			bytes = bytes >> 10;
		}
		return String(bytes) + units[u];
	}

	// initializations - setup functions on globalScope
	// which will be propagated to any other scope, and easily visible
	noobaa_app.run(function($rootScope) {
		$rootScope.safe_apply = safe_apply;
		$rootScope.safe_callback = safe_callback;
		$rootScope.human_size = human_size;
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
							scope.safe_apply(opt.complete);
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
	});

}(this)); // passing global this to allow exporting