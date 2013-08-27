/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */

(function(global) {
	'use strict';

	// declare our module with dependancy on the angular-ui module
	var noobaa_app = angular.module('noobaa_app', ['ui']);

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

	function nbdialog(opt, opt_for_open) {
		var e = $(this[0]);
		var data = e.data('nbdialog');

		if (opt === 'open') {
			if (!data) {
				e.nbdialog(opt_for_open);
				data = e.data('nbdialog');
			}
			if (data.state === 'open') {
				return;
			}
			data.state = 'open';
			var visible = e.is(':visible');
			var show = _.clone(data.opt.show);
			if (!visible) {
				show.complete = function() {
					e.trigger('nbdialog_open');
				};
			}
			if (data.opt.modal) {
				// create backdrop element
				$('<div id="nbdialog_modal_backdrop"></div>').css({
					position: 'fixed',
					left: 0,
					right: 0,
					top: 0,
					bottom: 0,
					zIndex: e.css('z-index') - 1,
				}).appendTo($('body'));
			}
			// register event to close dialog on escape
			var keydown = 'keydown.nbdialog_' + e.uniqueId().attr('id');
			$(window).on(keydown, function(event) {
				if (event.which == 27) {
					e.nbdialog('close');
				}
			});
			// ready, show the dialog
			e.show(show);

		} else if (opt === 'close') {
			if (data) {
				if (data.state === 'close') {
					return;
				}
				data.state = 'close';
				var visible = e.is(':visible');
				var hide = _.clone(data.opt.hide);
				hide.complete = function() {
					if (visible) {
						e.trigger('nbdialog_close');
					}
					if (data.opt.remove_on_close) {
						// when hide completes we can remove the element
						e.remove();
					}
				};
				// unregister event to close dialog on escape
				$('#nbdialog_modal_backdrop').remove();
				var keydown = 'keydown.nbdialog_' + e.uniqueId().attr('id');
				$(window).off(keydown);
				// ready, hide the dialog
				e.hide(hide);
			} else {
				e.hide();
			}

		} else if (opt === 'destroy') {
			if (data) {
				console.log('TODO: nbdialog destroy is imcomplete (element state not reverted)');
				e.nbdialog('close');
				e.resizable('destroy');
				e.draggable('destroy');
				e.data('nbdialog', null);
			}

		} else {
			opt = opt || {};
			opt.show = opt.show || {
				effect: 'drop',
				direction: 'up',
				duration: 250,
			};
			opt.hide = opt.hide || {
				effect: 'drop',
				direction: 'up',
				duration: 250,
			};
			// take the element from current parent to top level
			// to prevent css issues by inheritance
			e.detach().appendTo($('body'));
			e.attr({
				// Setting tabIndex makes the div focusable
				tabIndex: -1,
				role: "dialog"
			});
			e.css({
				position: 'absolute',
				height: 'auto',
				width: 'auto',
				// must change from display=none for css to compute,
				// so setting hidden in this short meanwhile
				visibility: 'hidden',
				display: 'block'
			});
			// move the element to center of viewport
			var top = (($(window).innerHeight() - e.height()) / 2);
			top = top > 100 ? top : 100;
			top += $(document).scrollTop();
			var left = (($(window).innerWidth() - e.width()) / 2);
			left = left > 100 ? left : 100;
			left += $(document).scrollLeft();
			var css = {
				top: top,
				left: left,
				width: opt.width || e.width(),
				height: opt.height || e.height(),
				overflow: 'hidden',
				zIndex: opt.zIndex || 1040
			};
			e.css(css);
			// compute inner elements dimentions
			// to make constant size header and footer,
			// but dynamic content with scroll (if needed).
			var head = e.find('.nbdialog_header');
			var foot = e.find('.nbdialog_footer');
			var content = e.find('.nbdialog_content');
			var head_height = head.outerHeight(true);
			var foot_height = foot.outerHeight(true);
			head.css({
				position: 'absolute',
				left: 0,
				right: 0,
				top: 0,
				height: head_height
			});
			foot.css({
				position: 'absolute',
				left: 0,
				right: 0,
				bottom: 0,
				height: foot_height
			});
			content.css({
				position: 'absolute',
				left: 0,
				right: 0,
				top: head_height,
				bottom: foot_height,
				height: 'auto',
				overflow: 'auto'
			});
			e.css({
				visibility: 'visible',
				display: 'none'
			});
			// initialize resizable and draggable
			e.resizable({
				minHeight: 100,
				minWidth: 200,
				handles: 'all',
				autoHide: true
			});
			e.draggable({
				containment: 'document',
				cursor: 'move',
				handle: '.nbdialog_drag',
				cancel: '.nbdialog_nodrag'
			});
			// set cursor to move on drag area
			e.find('.nbdialog_drag:not(a):not(button)').css('cursor', 'move');
			// handle close buttons
			e.find('.nbdialog_close').off('click').on('click', function() {
				e.nbdialog('close');
			});
			// save the data in the element
			e.data('nbdialog', {
				state: 'close',
				opt: opt
			});
		}
	}

	function nbalert(str, options) {
		var dlg = $('<div class="nbdialog alert_dialog fnt fntmd"></div>');
		var head = $('<div class="nbdialog_header nbdialog_drag"></div>').appendTo(dlg);
		var content = $('<div class="nbdialog_content"></div>').appendTo(dlg);
		var foot = $('<div class="nbdialog_footer text-center"></div>').appendTo(dlg);
		$('<span class="alert_icon"></span>')
			.append($('<i class="icon-warning-sign"></i>'))
			.appendTo(head);
		$('<span>Hmmm...</span>')
			.css('padding', '20px')
			.appendTo(head);
		$('<p></p>')
			.append($('<b></b>').html(str))
			.css('padding', '20px 20px 0 20px')
			.appendTo(content);
		$('<button class="nbdialog_close btn btn-default">Close</button>').appendTo(foot);
		dlg.appendTo($('body'));
		dlg.nbdialog('open', {
			width: 350,
			height: 250,
			remove_on_close: true,
			modal: true
		});
	}

	// initializations - setup functions on globalScope
	// which will be propagated to any other scope, and easily visible
	noobaa_app.run(function($rootScope) {
		$rootScope.safe_apply = safe_apply;
		$rootScope.safe_callback = safe_callback;
		$rootScope.human_size = human_size;
		// add nbdialog func per element as in - $('#dlg').nbdialog(...)
		jQuery.fn.nbdialog = nbdialog;
		// add nbalert as global jquery function - $.nbalert
		jQuery.nbalert = nbalert;
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
				var obj = scope.$eval(attr.nbDrop);
				if (!obj) {
					return;
				}
				element.droppable({
					accept: '.nbdrag',
					hoverClass: 'drop_hover_class',
					tolerance: 'pointer',
					drop: function(event, ui) {
						var nbobj = $(ui.draggable).data('nbobj');
						console.log(nbobj);
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
			}
		};
	});

	// TODO: how to cancel drag on escape ??
	// var escape_count = 0;
	// $(window).keyup(function(e) {
	// if (e.keyCode == 27) {
	// escape_count++;
	// console.log('ESCAPE', escape_count);
	// }
	// });

	noobaa_app.directive('nbDrag', function($parse, $rootScope) {
		return {
			restrict: 'A',
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