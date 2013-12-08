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
				'	<div nb-browse root_inode="mydata"></div>',
				'</div>'
			].join('\n')
		}).when('/install', {
			templateUrl: '/public/html/install_template.html',
		// }).otherwise({
			// redirectTo: '/'
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
					$scope.usage_percents = Math.floor(100 * $scope.user_usage / $scope.user_quota);
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
						$scope.usage_percents = Math.floor(100 * $scope.user_usage / $scope.user_quota);
					}
					$scope.$apply();
				}, 2000);
			}

			$http({
				method: 'GET',
				url: '/api/inode/null'
			}).then(function(res) {
				console.log('ROOT FOLDERS', res);
				for (var i = 0; i < res.data.entries.length; i++) {
					var e = res.data.entries[i];
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
				throw err;
			});


			$scope.show_uploads = false;

			nbUploadSrv.get_upload_target = function(event) {
				// make sure the uploads view shows
				$scope.show_uploads = true;

				// see inode_upload()
				var inode_upload = $(event.target).data('inode_upload');
				if (inode_upload) {
					return {
						inode_id: inode_upload.id
					};
				}

				console.log('UP', $scope, $scope.mydata);
				var dir_inode = $scope.mydata;
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
				root_inode: '='
			},
			controller: ['$scope', '$http', '$timeout', 'nbUploadSrv',
				function($scope, $http, $timeout, nbUploadSrv) {

					if ($scope.root_inode) {
						console.log('INITED WITH ROOT', $scope.root_inode);
						$scope.root_inode = {
							id: $scope.root_inode.id,
							isdir: $scope.root_inode.isdir,
							name: $scope.root_inode.name,
							level: 0,
							parents: [],
							entries: [],
							entries_map: {}
						};
						open_inode($scope._root_inode);
					} else {
						$scope._root_inode = {
							id: null,
							isdir: true,
							name: 'Home',
							level: -1,
							parents: [],
							entries: [],
							entries_map: {}
						};
						read_dir($scope._root_inode).then(function() {
							open_inode($scope._root_inode.entries[0]);
						});
					}


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
						for (var i = 0; i < inode.level; i++) {
							parents[i] = p;
							p = p.parent;
						}
						return parents;
					}

					function go_up_level() {
						if ($scope.dir_inode.level > 0) {
							$scope.dir_inode = $scope.dir_inode.parent;
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
							} else {
								add_selection(inode, $index);
							}
						} else if ($event.shiftKey && $scope.selection.length) {
							var from = $scope.selection[$scope.selection.length - 1].select_index;
							console.log('SELECT FROM', from, 'TO', $index);
							if ($index >= from) {
								for (var i = from; i <= $index; i++) {
									add_selection(inode.parent.entries[i], i);
								}
							} else {
								for (var i = from; i >= $index; i--) {
									add_selection(inode.parent.entries[i], i);
								}
							}
						} else {
							console.log('SELECT ONE', inode.name);
							reset_selection();
							add_selection(inode, $index);
						}
					}

					function open_inode(inode, $index, $event) {
						if (inode.isdir) {
							reset_selection();
							read_dir(inode);
							$scope.dir_inode = inode;
						} else {
							select_inode(inode, $index, $event);
							inode.is_previewing = true;
							read_file_attr(inode);
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

					function delete_inodes() {}

					function move_inodes() {}

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
				}
			]
		};
	});


})();
