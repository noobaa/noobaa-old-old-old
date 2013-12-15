/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
(function() {
	'use strict';

	// create our module
	var noobaa_app = angular.module('noobaa_app', ['ngRoute', 'ngAnimate']);


	noobaa_app.factory('nb', ['$http', '$timeout', '$interval', '$q', '$rootScope',
		function($http, $timeout, $interval, $q, $rootScope) {
			var nb = {};



			///////////////
			//// USER /////
			///////////////


			var server_data_raw = $('#server_data').html();
			nb.server_data = server_data_raw ? JSON.parse(server_data_raw) : {};
			nb.user = nb.server_data.user;

			nb.user_quota = -1;
			nb.user_usage = -1;
			nb.usage_percents = -1;

			nb.update_user_info = update_user_info;
			nb.user_pic_url = user_pic_url;

			function set_user_usage(quota, usage) {
				nb.user_quota = quota;
				nb.user_usage = usage;
				nb.usage_percents = Math.ceil(100 * usage / quota);
			}

			function update_user_info() {
				reset_update_user_info(true);
				return $http({
					method: "GET",
					url: "/api/user/",
				}).then(function(res) {
					set_user_usage(res.data.quota, res.data.usage);
					reset_update_user_info();
					return res;
				}, function(err) {
					console.log('FAILED GET USER', err);
					reset_update_user_info();
					throw err;
				});
			}

			function reset_update_user_info(unset) {
				$timeout.cancel(nb.timeout_update_user_info);
				nb.timeout_update_user_info = unset ? null : $timeout(update_user_info, 60000);
			}

			// testing code
			if (false) {
				var temp = 0;
				$interval(function() {
					if (temp > 100) {
						temp = 0;
					}
					set_user_usage(100, temp);
					temp += 10;
				}, 2000);
			}

			function user_pic_url(user) {
				if (!user) {
					return;
				}
				if (user.fbid) {
					return 'https://graph.facebook.com/' + user.fbid + '/picture';
				}
				if (user.googleid) {
					return 'https://plus.google.com/s2/photos/profile/' + user.googleid + '?sz=50';
				}
			}




			////////////////
			//// INODE /////
			////////////////


			nb.inode_api_url = inode_api_url;
			nb.is_immutable_root = is_immutable_root;
			nb.is_shared_with_me = is_shared_with_me;
			nb.is_not_mine = is_not_mine;
			nb.init_root_dir = init_root_dir;
			nb.read_dir = read_dir;
			nb.read_file_attr = read_file_attr;
			nb.is_dir_non_empty = is_dir_non_empty;
			nb.parents_path = parents_path;
			nb.recursive_delete = recursive_delete;
			nb.recursive_copy = recursive_copy;
			nb.copy_inode = copy_inode;

			function inode_api_url(inode_id) {
				return '/api/inode/' + inode_id;
			}

			function inode_call(method, inode_id) {
				return {
					method: method,
					url: '/api/inode/' + inode_id
				};
			}

			// return true for "My Data" and "Shared With Me"
			// which are user root dirs and shouldn't be modified.

			function is_immutable_root(inode) {
				return !inode.parent || !inode.parent.parent;
			}

			function is_shared_with_me(inode) {
				return inode.swm; // TODO NEED TO FILL THIS OR REMOVE
			}

			function is_not_mine(inode) {
				return inode.not_mine;
			}

			function init_root_dir() {
				return {
					id: null,
					parent: null,
					level: -1,
					name: 'Home',
					entries: [],
					entries_map: {}
				};
			}

			function read_dir(dir_inode) {
				console.log('READDIR', dir_inode.name);
				dir_inode.is_loading = true;
				return $http(inode_call('GET', dir_inode.id)).then(function(res) {
					dir_inode.is_loading = false;
					console.log('READDIR OK', dir_inode.name);
					var entries = res.data.entries;
					entries.sort(dir_inode.sorting_func || function(a, b) {
						return a.isdir ? -1 : 1;
					});
					dir_inode.entries = entries;
					dir_inode.entries_map = dir_inode.entries_map || {};
					var entries_map = {};
					for (var i = 0; i < entries.length; i++) {
						var e = dir_inode.entries_map[entries[i].id];
						if (!e) {
							e = entries[i];
						} else {
							angular.extend(e, entries[i]);
						}
						e.content_kind = e.content_type ? e.content_type.split('/')[0] : '';
						e.parent = dir_inode;
						e.level = dir_inode.level + 1;
						if (e.ctime) {
							e.ctime_date = new Date(e.ctime);
							e.ctime_display = e.ctime_date.toLocaleDateString();
						}
						entries[i] = e;
						entries_map[e.id] = e;
					}
					dir_inode.entries_map = entries_map;
					return res;
				}, function(err) {
					dir_inode.is_loading = false;
					console.error('FAILED READDIR', err);
					return $timeout(function() {
						read_dir(dir_inode);
					}, 3000);
				});
			}

			// TODO UNNEEDED

			function read_file_attr(inode) {
				return $http(inode_call('HEAD', inode.id)).then(function(res) {
					inode.content_type = res.headers('Content-Type');
					inode.content_kind = inode.content_type.split('/')[0];
					console.log('HEAD', inode.content_type, inode.content_kind);
				}, function(err) {
					console.error('FAILED HEAD', err);
					throw err;
				});
			}

			function is_dir_non_empty(inode, callback) {
				if (!inode.isdir) {
					callback(false);
					return;
				}
				var promise = read_dir(inode);
				if (!promise) {
					callback( !! inode.entries.length);
				} else {
					promise.then(function(res) {
						callback( !! inode.entries.length);
						return res;
					}, function(err) {
						callback( !! inode.entries.length);
						throw err;
					});
				}
			}

			function parents_path(inode) {
				if (!inode) {
					return;
				}
				var parents = new Array(inode.level);
				var p = inode.parent;
				for (var i = inode.level - 1; i >= 0; i--) {
					parents[i] = p;
					p = p.parent;
				}
				return parents;
			}

			function recursive_delete(inodes, del_scope, complete) {
				var jobq = new JobQueue($timeout, 32);
				var do_delete = function(inode_id, ctx) {
					if (!inode_id) {
						ctx.complete();
						return;
					}
					return $http({
						method: 'DELETE',
						url: '/api/inode/' + inode_id
					})['finally'](function() {
						del_scope.count++;
						ctx.count--;
						if (ctx.count === 0) {
							jobq.add({
								run: do_delete.bind(null, ctx.inode_id, ctx.parent || ctx)
							});
						}
					});
				};
				var add_recurse_job = function(inode, ctx) {
					jobq.add({
						run: delete_recurse.bind(null, {
							entries: inode.entries,
							count: inode.entries.length,
							inode_id: inode.id,
							parent: ctx
						})
					});
				};
				var delete_recurse = function(ctx) {
					if (!ctx.entries.length) {
						do_delete(ctx.inode_id, ctx.parent || ctx);
					}
					for (var i = 0; i < ctx.entries.length; i++) {
						var inode = ctx.entries[i];
						if (inode.isdir && !ctx.skip_read_dir) {
							read_dir(inode).then(
								add_recurse_job.bind(null, inode, ctx),
								do_delete.bind(null, inode.id, ctx));
						} else if (inode.isdir && inode.entries.length) {
							add_recurse_job(inode, ctx);
						} else {
							jobq.add({
								run: do_delete.bind(null, inode.id, ctx)
							});
						}
					}
				};
				delete_recurse({
					entries: inodes,
					count: inodes.length,
					skip_read_dir: true,
					complete: complete
				});
			}

			function recursive_copy(inode, copy_scope, new_parent_id, new_name) {
				copy_scope.concurrency++;
				return $http({
					method: 'PUT',
					url: '/api/inode/' + inode.id + '/copy',
					data: {
						new_parent_id: new_parent_id,
						new_name: new_name,
					}
				}).then(function(results) {
					copy_scope.concurrency--;
					copy_scope.count++;
					if (!inode.isdir) {
						return $q.when();
					}
					var new_parent_id = results.data.id;
					copy_scope.concurrency++;
					return nb.read_dir(inode).then(function() {
						copy_scope.concurrency--;
						var sons = inode.entries.slice(0); // copy array
						var copy_sons = function() {
							if (!sons || !sons.length) {
								return $q.when();
							}
							var promises = [];
							while (copy_scope.concurrency < copy_scope.max_concurrency && sons.length) {
								promises.push(recursive_copy(sons.pop(), copy_scope, new_parent_id, null).then(copy_sons));
							}
							return $q.all(promises);
						};
						return copy_sons();
					});
				}).
				catch (function(err) {
					console.error('FAILED COPY', inode, err);
					throw err;
				});
			}

			function copy_inode(inode) {
				if (!inode) {
					console.error('no selected inode, bailing');
					return;
				}
				if (is_immutable_root(inode)) {
					$.nbalert('Cannot copy root folder');
					return;
				}

				var copy_scope = $rootScope.$new();
				copy_scope.count = 0;
				copy_scope.concurrency = 0;
				copy_scope.max_concurrency = 32;

				// TODO OPEN FOLDER CHOOSER

				var on_copy = function() {
					var notify_message = '"' + inode.name + '" was copied to My-Data';
					if (copy_scope.count !== 1) {
						notify_message += ' (' + copy_scope.count + ' items)';
					}
					$.bootstrapGrowl(notify_message, {
						ele: 'body',
						type: 'info',
						offset: {
							from: 'top',
							amount: 60
						},
						align: 'right',
						width: 'auto',
						delay: 5000,
						allow_dismiss: true,
						stackup_spacing: 20
					});
				};
				return nb.recursive_copy(inode, copy_scope).then(on_copy, on_copy);
			}



			///////////////////
			//// SELECTION ////
			///////////////////


			nb.add_selection = add_selection;
			nb.remove_selection = remove_selection;
			nb.reset_selection = reset_selection;
			nb.select_item = select_item;
			nb.selection_items = selection_items;

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



			return nb;
		}
	]);









	// initializations - setup functions on globalScope
	// which will be propagated to any other scope, and easily visible

	noobaa_app.run(function($rootScope) {
		$rootScope.safe_apply = safe_apply;
		$rootScope.safe_callback = safe_callback;
		$rootScope.human_size = human_size;
		$rootScope.mobile_check = mobile_check;
		// add nbdialog func per element as in - $('#dlg').nbdialog(...)
		jQuery.fn.nbdialog = nbdialog;
		// add nbalert as global jquery function - $.nbalert
		jQuery.nbalert = nbalert;
		jQuery.nbconfirm = nbconfirm;

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
	});


	// noobaa_app.config([
	//	'$httpProvider', '$interpolateProvider',
	//	function($httpProvider, $interpolateProvider) {
	//		delete $httpProvider.defaults.headers.put;
	//		// set the symbol to avoid collision with server side templates
	//		// this is unneeded for now, but keeping the code in comment just for reference.
	//		$interpolateProvider.startSymbol('{{');
	//		$interpolateProvider.endSymbol('}}');
	//	}
	// ]);

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

	function nbdialog(opt, opt_for_open) {
		/* jshint validthis:true */
		var e = this.eq(0);
		var data = e.data('nbdialog');
		var keydown = 'keydown.nbdialog_' + e.uniqueId().attr('id');
		var visible;
		var body = $('body');

		if (opt === 'open') {
			if (!data || opt_for_open) {
				e.nbdialog(opt_for_open);
				data = e.data('nbdialog');
			}
			if (data.state === 'open') {
				return;
			}
			data.state = 'open';
			visible = e.is(':visible');
			var show = _.clone(data.opt.show);
			if (!visible) {
				show.complete = function() {
					e.trigger('nbdialog_open');
				};
			}
			if (data.opt.modal) {
				// modal stacking: modals go high also above previous modals
				var zIndex = 2000;
				var last_backdrop = $('.nbdialog_modal_backdrop:last');
				if (last_backdrop.length) {
					zIndex = parseInt(last_backdrop.css('z-index'), 10) + 2;
				}
				// create backdrop element
				$('<div class="nbdialog_modal_backdrop"></div>')
					.css('z-index', zIndex).appendTo(body).show();
				// stack dialog on top of backdrop
				e.css('z-index', zIndex + 1);
			}
			// bring it to front by adding at the end of body
			e.detach().appendTo(body);
			// register event to close dialog on escape
			$(window).on(keydown, function(event) {
				// ESCAPE KEY - close dialog
				if (event.which === 27 && !event.isDefaultPrevented()) {
					event.preventDefault();
					e.nbdialog('close');
					return;
				}
				// TAB KEY - prevent tabbing out of dialogs (taken from jqueryui)
				if (event.which === 9) {
					var tabbables = e.find(":tabbable");
					var first = tabbables.filter(":first");
					var last = tabbables.filter(":last");
					if ((event.target === last[0] || event.target === e[0]) && !event.shiftKey) {
						first.focus(1);
						event.preventDefault();
					} else if ((event.target === first[0] || event.target === e[0]) && event.shiftKey) {
						last.focus(1);
						event.preventDefault();
					}
				}
			});
			// ready, show the dialog
			e.show(show);
			e.focus(1).find(":tabbable").filter(":first").focus(1);

		} else if (opt === 'close') {
			if (data) {
				if (data.state === 'close') {
					return;
				}
				data.state = 'close';
				visible = e.is(':visible');
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
				// remove the modal backdrop
				if (data.opt.modal) {
					$('.nbdialog_modal_backdrop:last').remove();
				}
				// unregister event to close dialog on escape
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
			if (data) {
				console.log('nbdialog init', data, opt);
			}
			opt = $.extend(true, {}, data ? data.opt : null, opt);
			opt.show = opt.show || {
				effect: 'drop',
				direction: 'up',
				duration: 250,
			};
			opt.hide = opt.hide || {
				effect: 'fade',
				direction: 'up',
				duration: 200,
			};
			// take the element from current parent to top level
			// to prevent css issues by inheritance
			e.detach().appendTo(body);
			e.attr({
				// Setting tabIndex makes the div focusable
				tabIndex: -1,
				role: "dialog"
			});
			// in order to compute element optimal size we set height/width = auto
			// but must also change from display=none for css to compute.
			// so we set to hidden in this short meanwhile.
			e.css(_.extend({
				height: 'auto',
				width: 'auto'
			}, opt.css, {
				// we force these css on top of given css for the dialog to work
				display: 'block',
				visibility: 'hidden',
				position: 'absolute'
			}));
			// compute the element location in center of viewport
			var width = e.outerWidth();
			var height = e.outerHeight();
			var top = (($(window).innerHeight() - height) / 2);
			top = top > 100 ? top : 100;
			top += $(document).scrollTop();
			var left = (($(window).innerWidth() - width) / 2);
			left = left > 100 ? left : 100;
			left += $(document).scrollLeft();
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
				height: head_height,
				width: 'auto'
			});
			foot.css({
				position: 'absolute',
				left: 0,
				right: 0,
				bottom: 0,
				height: foot_height,
				width: 'auto'
			});
			content.css({
				position: 'absolute',
				left: 0,
				right: 0,
				top: head_height,
				bottom: foot_height,
				height: 'auto',
				width: 'auto',
				overflow: 'auto'
			});
			e.css(_.extend({
				top: top,
				left: left,
				width: width,
				height: height,
			}, opt.css, {
				// we force these css on top of given css for the dialog to work
				display: data && data.state === 'open' ? 'block' : 'none',
				visibility: 'visible'
			}));
			// initialize resizable and draggable
			e.resizable({
				containment: opt.containment || 'document',
				minHeight: 100,
				minWidth: 200,
				handles: 'all',
				autoHide: true
			});
			e.draggable({
				containment: opt.containment || 'document',
				cursor: 'move',
				// stack: '.nbdialog, .nbdialog_modal_backdrop',
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
				state: data ? data.state : 'close',
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
		dlg.nbdialog('open', _.extend({
			remove_on_close: true,
			modal: true
		}, options));
	}

	function nbconfirm(msg, options) {
		var dlg = $('<div class="nbdialog confirm_dialog fnt fntmd"></div>');
		var head = $('<div class="nbdialog_header nbdialog_drag"></div>').appendTo(dlg);
		var content = $('<div class="nbdialog_content"></div>').appendTo(dlg);
		var foot = $('<div class="nbdialog_footer"></div>').appendTo(dlg);
		$('<span class="confirm_icon"></span>')
			.append($('<i class="icon-question-sign"></i>'))
			.appendTo(head);
		$('<span>Hmmm?</span>')
			.css('padding', '20px')
			.appendTo(head);
		content.css('padding', '20px').append(msg);
		$('<button class="nbdialog_close"></button>')
			.text(options.noButtonCaption || 'No')
			.addClass(options.noButtonClass || 'btn btn-default')
			.appendTo(foot);
		if (options.on_close) {
			dlg.on('nbdialog_close.nbconfirm', options.on_close.bind(dlg));
		}
		$('<button></button>')
			.text(options.yesButtonCaption || 'Yes')
			.addClass(options.yesButtonClass || 'btn btn-primary pull-right')
			.appendTo(foot)
			.on('click', function() {
				var prevent_close = false;
				if (options.on_confirm) {
					prevent_close = options.on_confirm.bind(dlg)();
				}
				if (!prevent_close) {
					dlg.off('nbdialog_close.nbconfirm');
					dlg.nbdialog('close');
				}
			});
		dlg.appendTo($('body'));
		dlg.nbdialog('open', _.extend({
			remove_on_close: true,
			modal: true
		}, options));
	}


	// http wrapper to be used with async library
	noobaa_app.factory('$http_async', ['$http',
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

	noobaa_app.directive('nbContent', ['$parse', 'nb',
		function($parse, nb) {
			return {
				replace: true,
				link: function(scope, element, attr) {
					scope.nb = nb;
					scope.$watch(attr.nbContent, function(value) {
						scope.inode = scope.$eval(attr.nbContent) || {};
						// console.log('NBCONTENT', scope.inode);
					});
					scope.notifyLayout = scope.$eval(attr.notifyLayout);
				},
				template: [
					'<div>',
					'<div ng-if="inode.isdir" class="text-center" style="padding: 15px">',
					'	<i class="fa fa-folder-open fa-2x"></i> {{inode.name}}',
					'</div>',
					'<div ng-if="!inode.isdir">',
					' <div ng-if="inode.content_type" ng-switch="inode.content_kind">',
					'	<video ng-switch-when="video" controls="controls" preload="none" ng-src="{{nb.inode_api_url(inode.id)}}"',
					'		class="img-responsive center-block" nb-on-load="notifyLayout()"></video>',
					'	<audio ng-switch-when="audio" controls="controls" preload="none" ng-src="{{nb.inode_api_url(inode.id)}}"',
					'		class="img-responsive center-block" nb-on-load="notifyLayout()"></audio>',
					'	<img ng-switch-when="image" ng-src="{{nb.inode_api_url(inode.id)}}"',
					'		class="img-responsive center-block" style="max-height: 60%" nb-on-load="notifyLayout()" />',
					'	<div ng-switch-default Xnb-resizable class="text-center bggrey" style="padding: 15px">',
					'		<a class="btn btn-link" ng-show="!show_object" ng-click="show_object=true">',
					'			<i class="fa fa-file-o fa-2x"></i> {{inode.content_type}}',
					'		</a>',
					'		<div ng-if="!!show_object">',
					'			<object ng-attr-data="{{nb.inode_api_url(inode.id)}}" ng-attr-type="{{inode.content_type}}"',
					'				width="100%" class="center-block" nb-on-load="notifyLayout()"></object>',
					'		</div>',
					'	</div>',
					' </div>',
					' <div ng-if="!inode.content_type" class="text-center" style="padding: 20px">',
					'	<i class="fa fa-file-o fa-2x"></i> {{inode.name}}',
					' </div>',
					'</div>',
					'</div>'
				].join('\n')
			};
		}
	]);

	noobaa_app.directive('nbOnLoad', ['$parse',
		function($parse) {
			return {
				link: function(scope, element, attr) {
					var fn = $parse(attr.nbOnLoad);
					element.bind('load', function(event) {
						scope.$apply(fn);
					});
				}
			};
		}
	]);

	noobaa_app.directive('nbRightClick', ['$parse',
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

	noobaa_app.directive('nbResizable', function() {
		return {
			restrict: 'A', // use as attribute
			link: function(scope, element, attr) {
				element.resizable();
			}
		};
	});

	noobaa_app.directive('nbTooltip', function() {
		return {
			restrict: 'A', // use as attribute
			link: function(scope, element, attr) {
				scope.$watch(attr.nbTooltip, function(value) {
					element.tooltip(value);
				});
			}
		};
	});

	noobaa_app.directive('nbPopover', ['$compile',
		function($compile) {
			return {
				restrict: 'A', // use as attribute
				link: function(scope, element, attr) {
					scope.$watch(attr.nbPopover, function(value) {
						if (value.element) {
							value.content = $compile($(value.element)[0].outerHTML)(scope);
							value.html = true;
							delete value.element;
						}
						console.log('POPOVER', value);
						element.popover(value);
					});
				}
			};
		}
	]);

	noobaa_app.directive('nbKey', ['$parse',
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

	noobaa_app.directive('nbDrop', ['$parse', '$rootScope',
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

	noobaa_app.directive('nbDrag', ['$parse', '$rootScope',
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

	noobaa_app.directive('nbEffectToggle', ['$timeout',
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

	noobaa_app.directive('nbEffectSwitchClass', ['$parse',
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

	noobaa_app.directive('nbShine', ['$parse',
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


	noobaa_app.factory('LinkedList', function() {
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


	noobaa_app.factory('JobQueue', ['$timeout',
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

})();
