/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');


	///////////////////
	// ROUTES CONFIG //
	///////////////////


	noobaa_app.config(function($routeProvider, $locationProvider) {
		$locationProvider.html5Mode(true);
		$routeProvider.when('/', {
			templateUrl: '/public/html/feed_template.html',
			controller: 'FeedCtrl'
		}).when('/mydata/:path*?', {
			template: [
				'<div class="container">',
				'	<div nb-browse ng-if="context" context="context"></div>',
				'</div>'
			].join('\n')
		}).when('/install', {
			templateUrl: '/public/html/install_template.html',
		}).otherwise({
			redirectTo: '/'
		});
	});



	/////////////////////
	// HOME CONTROLLER //
	/////////////////////


	noobaa_app.controller('HomeCtrl', ['$scope', '$http', '$timeout', '$location', 'nbUploadSrv',
		function($scope, $http, $timeout, $location, nbUploadSrv) {

			var server_data_raw = $('#server_data').html();
			$scope.server_data = server_data_raw ? JSON.parse(server_data_raw) : {};
			$scope.user = $scope.server_data.user;

			$scope.user_quota = 0;
			$scope.user_usage = 0;
			$scope.usage_percents = 0;

			function usage_refresh() {
				reset_usage_refresh(true);
				return $http({
					method: "GET",
					url: "/api/user/",
				}).then(function(res) {
					$scope.user_quota = res.data.quota;
					$scope.user_usage = res.data.usage;
					$scope.usage_percents = Math.ceil(100 * $scope.user_usage / $scope.user_quota);
					reset_usage_refresh();
					return res;
				}, function(err) {
					console.log("Error in querying user usage: ", err);
					reset_usage_refresh();
					throw err;
				});
			}

			function reset_usage_refresh(unset) {
				$timeout.cancel($scope.usage_refresh_timeout);
				$scope.usage_refresh_timeout = unset ? null : $timeout(usage_refresh, 60000);
			}
			usage_refresh();

			if (false) {
				setInterval(function() {
					$scope.usage_percents += 10;
					if ($scope.usage_percents > 100) {
						$scope.usage_percents = Math.ceil(100 * $scope.user_usage / $scope.user_quota);
					}
					$scope.$apply();
				}, 2000);
			}

			function read_root_dirs() {
				return $http({
					method: 'GET',
					url: '/api/inode/null'
				}).then(function(res) {
					console.log('ROOT FOLDERS', res);
					for (var i = 0; i < res.data.entries.length; i++) {
						var e = res.data.entries[i];
						e.level = 0;
						if (e.name === 'My Data') {
							$scope.mydata = e;
						} else if (e.name === 'Shared With Me') {
							$scope.swm = e;
						} else {
							console.error('UNRECOGNIZED ROOT FOLDER', e);
						}
					}
					return res;
				}, function(err) {
					console.error('GET ROOT FOLDERS FAILED', err);
					return $timeout(read_root_dirs, 1000);
				});
			}

			read_root_dirs().then(function() {
				$scope.context = {
					current_dir: $scope.mydata
				};
			});

			$scope.nbUploadSrv = nbUploadSrv;

			nbUploadSrv.get_upload_target = function(event) {
				// see inode_upload()
				var inode_upload = $(event.target).data('inode_upload');
				if (inode_upload) {
					return {
						inode_id: inode_upload.id
					};
				}

				console.log('UP', $scope, $scope.context);
				var dir_inode = $scope.context.current_dir;
				if (!dir_inode) {
					console.error('no selected dir, bailing');
					return false;
				}
				/* TODO FIX
				if (dir_inode.is_shared_with_me()) {
					$.nbalert('Cannot upload to a shared folder');
					return false;
				}
				if (dir_inode.is_not_mine() || dir_inode.owner_name) {
					$.nbalert('Cannot upload to someone else\'s folder');
					return false;
				}
				*/
				return {
					dir_inode_id: dir_inode.id
				};
			};

			$scope.get_pic_url = function(user) {
				if (!user) {
					return;
				}
				if (user.fbid) {
					return 'https://graph.facebook.com/' + user.fbid + '/picture';
				}
				if (user.googleid) {
					return 'https://plus.google.com/s2/photos/profile/' + user.googleid + '?sz=50';
				}
			};
		}
	]);



	//////////////////////
	// FEEDS CONTROLLER //
	//////////////////////


	noobaa_app.controller('FeedCtrl', ['$scope', '$http', '$timeout', 'nbUploadSrv',
		function($scope, $http, $timeout, nbUploadSrv) {

			function refresh_feeds() {
				console.log('READ SWM', $scope.swm);
				if (!$scope.swm) {
					return;
				}
				$scope.refreshing_feeds = true;
				$http({
					method: 'GET',
					url: '/api/inode/' + $scope.swm.id
				}).then(function(res) {
					$scope.refreshing_feeds = false;
					console.log('SWM FOLDER', res);
					for (var i = 0; i < res.data.entries.length; i++) {
						var e = res.data.entries[i];
						if (e.ctime) {
							e.ctime_date = new Date(e.ctime);
							e.ctime_display = e.ctime_date.toLocaleDateString();
						}
						console.log('SWM', e);
					}
					$scope.feeds = res.data.entries;
					$scope.feeds.sort(function(a, b) {
						return a.ctime_date > b.ctime_date ? -1 : 1;
					});
					return res;
				}, function(err) {
					$scope.refreshing_feeds = false;
					console.error('GET SWM FOLDER FAILED', err);
					throw err;
				});
			}

			$scope.$watch('swm', refresh_feeds);
			refresh_feeds();

			$scope.refresh_feeds = refresh_feeds;
		}
	]);



	//////////////////////
	// BROWSE DIRECTIVE //
	//////////////////////


	noobaa_app.directive('nbBrowse', function() {
		return {
			replace: true,
			templateUrl: '/public/html/browse_template.html',
			scope: { // isolated scope
				context: '='
			},
			controller: ['$scope', '$http', '$timeout', '$q', '$compile', '$rootScope', 'nbUploadSrv', 'JobQueue',
				function($scope, $http, $timeout, $q, $compile, $rootScope, nbUploadSrv, JobQueue) {
					$scope.human_size = $rootScope.human_size;
					$scope.nbUploadSrv = nbUploadSrv;


					console.log('BROWSER CONTEXT', $scope.context);
					set_current_dir($scope.context.current_dir);
					open_inode($scope.current_dir);

					nbUploadSrv.notify_create_in_dir = function(dir_id) {
						if ($scope.current_dir.id === dir_id) {
							open_inode($scope.current_dir);
						}
					};

					function read_dir(dir_inode) {
						console.log('READDIR', dir_inode.name);
						dir_inode.is_loading = true;
						return $http({
							method: 'GET',
							url: inode_source_url(dir_inode)
						}).then(function(res) {
							dir_inode.is_loading = false;
							console.log('READDIR', dir_inode.name, res);
							var entries = res.data.entries;
							entries.sort(function(a, b) {
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

					function read_file_attr(inode) {
						return $http({
							method: 'HEAD',
							url: inode_source_url(inode)
						}).then(function(res) {
							inode.content_type = res.headers('Content-Type');
							inode.content_kind = inode.content_type.split('/')[0];
							console.log('HEAD', inode.content_type, inode.content_kind);
						}, function(err) {
							console.error('FAILED HEAD', err);
							throw err;
						});
					}

					function set_current_dir(dir_inode) {
						$scope.context.current_dir = dir_inode;
						$scope.current_dir = dir_inode;
						$scope.search_in_folder = '';
					}

					// return true for "My Data" and "Shared With Me"
					// which are user root dirs and shouldn't be modified.

					function is_immutable_root(inode) {
						return inode.level <= 0;
					}

					function is_shared_with_me(inode) {
						return inode.swm; // TODO NEED TO FILL THIS OR REMOVE
					}

					function is_not_mine(inode) {
						return inode.not_mine;
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

					function go_up_level() {
						if ($scope.current_dir.level > 0) {
							set_current_dir($scope.current_dir.parent);
						}
					}

					function stop_event(event) {
						if (event.stopPropagation) {
							event.stopPropagation();
						}
						return false;
					}

					function add_selection(inode, index) {
						if (inode.is_selected) {
							return;
						}
						$scope.selection.push(inode);
						inode.is_selected = true;
						inode.select_index = index;
					}

					function remove_selection(inode) {
						if (!inode.is_selected) {
							return;
						}
						var pos = $scope.selection.indexOf(inode);
						if (pos >= 0) {
							$scope.selection.splice(pos, 1);
						}
						inode.is_selected = false;
						inode.select_index = null;
						inode.is_previewing = false;
					}

					function reset_selection() {
						var selection = $scope.selection;
						$scope.selection = [];
						if (!selection) {
							return;
						}
						for (var i = 0; i < selection.length; i++) {
							remove_selection(selection[i]);
						}
					}

					function select_inode(inode, $index, $event) {
						if ($event.ctrlKey || $event.metaKey ||
							($scope.selection.length === 1 && $scope.selection[0] === inode)) {
							console.log('SELECT TOGGLE', inode.name, inode.is_selected);
							if (inode.is_selected) {
								remove_selection(inode);
								return false;
							} else {
								add_selection(inode, $index);
							}
						} else if ($event.shiftKey && $scope.selection.length) {
							var from = $scope.selection[$scope.selection.length - 1].select_index;
							console.log('SELECT FROM', from, 'TO', $index);
							var i;
							if ($index >= from) {
								for (i = from; i <= $index; i++) {
									add_selection(inode.parent.entries[i], i);
								}
							} else {
								for (i = from; i >= $index; i--) {
									add_selection(inode.parent.entries[i], i);
								}
							}
						} else {
							console.log('SELECT ONE', inode.name);
							reset_selection();
							add_selection(inode, $index);
						}
						return true;
					}

					function open_inode(inode, $index, $event) {
						if (inode.isdir) {
							reset_selection();
							read_dir(inode);
							set_current_dir(inode);
						} else {
							if (select_inode(inode, $index, $event)) {
								inode.is_previewing = true;
								read_file_attr(inode);
							} else {
								inode.is_previewing = false;
							}
							return stop_event($event);
						}
					}

					function toggle_preview(inode) {
						inode.is_previewing = !inode.is_previewing;
						if (inode.is_previewing && !inode.content_type) {
							read_file_attr(inode);
						}
					}

					function inode_source_url(inode) {
						return '/api/inode/' + inode.id;
					}

					function download_inode(inode) {
						var url = inode_source_url(inode) + '?is_download=true';
						$('<iframe style="display: none">')[0].src = url;
						// var win = window.open(url, '_blank');
						// win.focus();
					}

					function rename_inode(inode) {
						if (!inode) {
							console.error('no selected inode, bailing');
							return;
						}
						if (is_immutable_root(inode)) {
							$.nbalert('Cannot rename root folder');
							return;
						}
						if (is_not_mine(inode)) {
							$.nbalert('Cannot rename someone else\'s file');
							return;
						}
						var dlg = $('#rename_dialog').clone();
						var input = dlg.find('#dialog_input');
						input.val(inode.name);
						dlg.find('.inode_label').html(inode.name /*make_inode_with_icon()*/ );
						dlg.find('#dialog_ok').off('click').on('click', function() {
							dlg.nbdialog('close');
							if (!input.val() || input.val() === inode.name) {
								return;
							}
							return $http({
								method: 'PUT',
								url: '/api/inode/' + inode.id,
								data: {
									parent: inode.parent.id,
									name: input.val()
								}
							}).then(function(res) {
								read_dir(inode.parent);
								return res;
							}, function(err) {
								read_dir(inode.parent);
								throw err;
							});
						});
						dlg.nbdialog('open', {
							remove_on_close: true,
							modal: true
						});
					}

					function new_folder(dir_inode) {
						if (!dir_inode) {
							console.error('no selected dir, bailing');
							return;
						}
						// check dir creation conditions
						// the first condition is true when looking at a directory 
						// which is not owned by the user.
						// the second is true for ghosts or when not owned by the user
						if (is_not_mine(dir_inode) || dir_inode.owner_name) {
							$.nbalert('Cannot create folder in someone else\'s folder');
							return;
						}
						var dlg = $('#mkdir_dialog').clone();
						var input = dlg.find('#dialog_input');
						input.val('');
						dlg.find('.inode_label').html(dir_inode.name /*make_inode_with_icon()*/ );
						dlg.find('#dialog_ok').off('click').on('click', function() {
							dlg.nbdialog('close');
							if (!input.val()) {
								return;
							}
							return $http({
								method: 'POST',
								url: '/api/inode/',
								data: {
									id: dir_inode.id,
									name: input.val(),
									isdir: true
								}
							}).then(function(res) {
								read_dir(dir_inode);
								return res;
							}, function(err) {
								read_dir(dir_inode);
								throw err;
							});
						});
						dlg.nbdialog('open', {
							remove_on_close: true,
							modal: true
						});
					}

					function delete_inodes() {
						var selection = $scope.selection.slice(0); // make copy of array
						var read_dir_promises = new Array(selection.length);
						for (var i = 0; i < selection.length; i++) {
							var inode = selection[i];
							if (!inode) {
								console.error('no selected inode, bailing');
								return;
							}
							if (is_immutable_root(inode)) {
								$.nbalert('Cannot delete root folder');
								return;
							}
							if (is_not_mine(inode)) {
								$.nbalert('Cannot delete someone else\'s file ' + inode.name);
								return;
							}
							read_dir_promises[i] = inode.isdir ? read_dir(inode) : $q.when(null);
						}
						$q.all(read_dir_promises).then(function(read_dir_results) {
							var all_empty = _.reduce(read_dir_results, function(memo, res) {
								return memo && (!res || res.data.entries.length === 0);
							}, true);
							read_dir_results = null;
							var dlg = $('#delete_dialog').clone();
							if (!all_empty) {
								//modify the display message in the dialog
								dlg.find('#not_empty_msg').css('display', 'block');
								dlg.find('#normal_msg').css('display', 'none');
							}
							var del_scope = $scope.$new();
							del_scope.count = 0;
							// TODO
							// dlg.find('.inode_label').html(inode.make_inode_with_icon());
							dlg.find('#dialog_ok').off('click').on('click', function() {
								dlg.find('button.nbdialog_close').text('Hide');
								dlg.find('a.nbdialog_close').attr('title', 'Hide');
								dlg.find('#dialog_ok')
									.addClass('disabled')
									.empty()
									.append($('<i class="icon-spinner icon-spin icon-large icon-fixed-width"></i>'))
									.append($compile('<span style="padding-left: 20px">Deleted {{count}}</span>')(del_scope));
								del_scope.$digest();

								var jobq = new JobQueue(32);
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
									entries: selection,
									count: selection.length,
									skip_read_dir: true,
									complete: function() {
										read_dir($scope.current_dir);
										dlg.nbdialog('close');
										del_scope.$destroy();
									}
								});
							});
							dlg.nbdialog('open', {
								remove_on_close: true,
								modal: true
							});
						}, function(err) {
							console.error('FAILED TO CHECK DIR EMPTY', err);
							throw err;
						});
					}

					function move_inodes() {}

					function copy_inode(inode) {
						if (!inode) {
							console.error('no selected inode, bailing');
							return;
						}
						if (is_immutable_root(inode)) {
							$.nbalert('Cannot copy root folder');
							return;
						}

						var copy_scope = $scope.$new();
						copy_scope.count = 0;
						copy_scope.concurrency = 0;
						copy_scope.max_concurrency = 32;

						var on_copy = function() {
							$(function() {

								inode.is_dir_non_empty(function(is_dir_non_empty) {

									var notify_message = 'Copy of ' + inode.name + ' is done.';
									if (is_dir_non_empty) {
										notify_message += ' Copied ' + copy_scope.count + ' items.';
									}
									setTimeout(function() {
										$.bootstrapGrowl(notify_message, {
											type: 'success',
											align: 'center',
											width: 'auto',
										});
									}, 10);
								});
								return;
							});
						};
						return inode.copy(copy_scope, null, null, true).then(on_copy, on_copy);
					}

					function share_inode(inode) {
						if (!inode) {
							console.error('no selected inode, bailing');
							return;
						}
						if (is_immutable_root(inode)) {
							$.nbalert('Cannot share root folder');
							return;
						}
						if (is_shared_with_me(inode)) {
							$.nbalert('Cannot share files in the "' + SWM + '" folder.<br/>' +
								'Use "Copy"...');
							return;
						}
						if (is_not_mine(inode)) {
							$.nbalert('Cannot share someone else\'s file');
							return;
						}
						$('#share_modal').scope().open(inode);

					}

					$scope.parents_path = parents_path;
					$scope.go_up_level = go_up_level;
					$scope.open_inode = open_inode;
					$scope.select_inode = select_inode;
					$scope.toggle_preview = toggle_preview;
					$scope.inode_source_url = inode_source_url;
					$scope.download_inode = download_inode;
					$scope.rename_inode = rename_inode;
					$scope.delete_inodes = delete_inodes;
					$scope.new_folder = new_folder;
					$scope.move_inodes = move_inodes;
					$scope.copy_inode = copy_inode;
					$scope.share_inode = share_inode;
				}
			]
		};
	});




	/////////////////////
	// SHARE DIRECTIVE //
	/////////////////////


	noobaa_app.controller('ShareModalCtrl', ['$scope', '$http',
		function($scope, $http) {
			var dlg = $('#share_modal');

			function get_share_list(inode) {
				console.log('get_share_list', inode);
				return $http({
					method: 'GET',
					url: '/api/inode/' + inode.id + '/share_list'
				});
			}

			function set_share_list(inode, share_list) {
				console.log('share', inode, 'with', share_list);
				return $http({
					method: 'PUT',
					url: '/api/inode/' + inode.id + '/share_list',
					data: {
						share_list: share_list
					}
				});
			}

			function mklink(inode, link_options) {
				console.log('mklink', inode, link_options);
				return $http({
					method: 'POST',
					url: '/api/inode/' + inode.id + '/link',
					data: {
						link_options: link_options
					}
				});
			}

			function rmlinks(inode) {
				console.log('revoke_links', inode);
				return $http({
					method: 'DELETE',
					url: '/api/inode/' + inode.id + '/link'
				});
			}

			$scope.open = function(inode) {
				// TODO FIX ICON
				dlg.find('.inode_label').html(inode.name /*make_inode_with_icon()*/ );
				$scope.share_is_loading = true;
				$scope.share_inode = inode;
				get_share_list(inode).then(function(res) {
					$scope.share_is_loading = false;
					$scope.share_list = res.data.list;
				}, function() {
					$scope.share_is_loading = false;
				});
				dlg.nbdialog('open', {
					modal: true,
					css: {
						height: "80%",
						width: 350
					}
				});
			};

			$scope.submit = function() {
				var inode = $scope.share_inode;
				var share_list = $scope.share_list;
				$scope.share_is_loading = true;
				set_share_list(inode, share_list).then(function(res) {
					$scope.share_is_loading = false;
					$('#share_modal').nbdialog('close');
					// TODO NEED TO READDIR AFTER SHARE?
					// if (inode.parent) {
					// 	inode.parent.read_dir();
					// }
				}, function() {
					$scope.share_is_loading = false;
				});
			};

			$scope.mklink = function() {
				var inode = $scope.share_inode;
				$scope.share_is_loading = true;
				mklink(inode).then(function(res) {
					$scope.share_is_loading = false;
					$('#share_modal').nbdialog('close');
					console.log('mklink', res.data);
					var dlg = $('#getlink_dialog').clone();
					// TODO FIX ICON
					dlg.find('.inode_label').html(inode.name /*make_inode_with_icon()*/ );
					dlg.find('.link_label').html(
						'<div style="height: 100%; word-wrap: break-word; word-break: break-all">' +
						window.location.host + res.data.url + '</div>');
					dlg.nbdialog('open', {
						remove_on_close: true,
						modal: false,
						css: {
							width: 300,
							height: 400
						}
					});
				}, function() {
					$scope.share_is_loading = false;
				});
			};

			$scope.rmlinks = function() {
				var inode = $scope.share_inode;
				$scope.share_is_loading = true;
				rmlinks(inode).then(function(res) {
					$scope.share_is_loading = false;
					$('#share_modal').nbdialog('close');
					console.log('rmlinks', res.data);
					$.nbalert('Revoked!');
				}, function() {
					$scope.share_is_loading = false;
				});
			};

		}
	]);
})();
