/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
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
			controller: ['$scope',
				function($scope) {
					$scope.refresh_feeds();
				}
			]
		}).when('/mydata/:path*?', {
			template: [
				'<div class="container">',
				'	<div nb-browse ng-if="context" context="context" notify-layout="angular.noop"></div>',
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


	noobaa_app.controller('HomeCtrl', ['$scope', '$http', '$timeout', '$interval', '$window', '$location', 'nb', 'nbUploadSrv',
		function($scope, $http, $timeout, $interval, $window, $location, nb, nbUploadSrv) {
			$scope.nb = nb;
			$scope.nbUploadSrv = nbUploadSrv;
			$scope.refresh_feeds = refresh_feeds;
			$scope.root_dir = nb.init_root_dir();

			nb.update_user_info();

			nb.read_dir($scope.root_dir).then(function(res) {
				console.log('ROOT FOLDERS', res);
				for (var i = 0; i < res.data.entries.length; i++) {
					var e = res.data.entries[i];
					if (e.name === 'My Data') {
						e.level = 0;
						$scope.mydata = e;
					} else if (e.name === 'Shared With Me') {
						e.level = -1;
						$scope.swm = e;
					} else {
						console.error('UNRECOGNIZED ROOT FOLDER', e);
					}
				}
				$scope.context = {
					current_inode: $scope.mydata
				};
				refresh_feeds();
				return res;
			}, function(err) {
				console.error('GET ROOT FOLDERS FAILED', err);
				return $timeout(read_root_dirs, 1000);
			});

			function refresh_feeds() {
				console.log('READ SWM', $scope.swm);
				if (!$scope.swm) {
					return;
				}
				$scope.swm.sorting_func = function(a, b) {
					return a.ctime_date > b.ctime_date ? -1 : 1;
				};
				$scope.refreshing_feeds = true;
				nb.read_dir($scope.swm).then(function(res) {
					console.log('SWM FOLDER', res);
					$scope.refreshing_feeds = false;
					var feeds = $scope.swm.entries;
					feeds = feeds.concat(feeds);
					feeds = feeds.concat(feeds);
					var feeds_per_page = 9;
					var num_feed_pages = Math.ceil(feeds.length / feeds_per_page);
					$scope.feed_pages = new Array(num_feed_pages);
					for (var i = 0; i < num_feed_pages; i++) {
						$scope.feed_pages[i] = feeds.slice(i * feeds_per_page, (i + 1) * feeds_per_page);
					}
					$scope.feeds = feeds;
					$scope.notify_layout(true);
					return res;
				}, function(err) {
					console.error('GET SWM FOLDER FAILED', err);
					$scope.refreshing_feeds = false;
					throw err;
				});
			}

			$scope.notify_layout = function(destroy) {
				$timeout.cancel($scope.do_layout_timeout);
				$scope.do_layout_timeout = $timeout(function() {
					console.log('LAYOUT');
					if (destroy && $scope.masonry) {
						$scope.masonry.destroy();
						$scope.masonry = null;
					}
					if ($scope.masonry) {
						$scope.masonry.layout();
					} else {
						$scope.masonry = new Masonry($('.feeds_container')[0], {
							itemSelector: '.feed_item',
							columnWidth: 300,
							gutter: 20
						});
					}
				}, 50);
			};


			nbUploadSrv.get_upload_target = function(event) {
				// see inode_upload()
				var inode_upload = $(event.target).data('inode_upload');
				if (inode_upload) {
					return {
						inode_id: inode_upload.id
					};
				}

				console.log('UP', $scope, $scope.context);
				var dir_inode = $scope.context.current_inode;
				if (!dir_inode || !dir_inode.isdir) {
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


			$scope.active_link = function(link) {
				return link === $window.location.pathname ? 'active' : '';
			};



			var feedback_dialog = $('#feedback_dialog');
			// TODO FIX THIS ISSUE
			$timeout(function() {
				feedback_dialog.nbdialog({
					modal: true,
					css: {
						width: 500
					}
				});
			}, 1);

			$scope.click_feedback = function() {
				$scope.feedback_send_done = false;
				feedback_dialog.nbdialog('open');
			};

			$scope.send_feedback = function() {
				// add to persistent local storage, and return immediately
				// the worker will send in background
				$scope.feedbacks.push($scope.feedback_text);
				localStorage.feedbacks = JSON.stringify($scope.feedbacks);
				$scope.feedback_send_done = true;
				$scope.feedback_text = '';
				$scope.feedback_worker();
			};

			$scope.feedback_worker = function() {
				if ($scope.feedback_promise) {
					return;
				}
				if (!$scope.feedbacks.length) {
					return;
				}
				console.log('sending feedback.', 'queue:', $scope.feedbacks.length);
				$scope.feedback_promise = $http({
					method: 'POST',
					url: '/api/user/feedback/',
					data: {
						feedback: $scope.feedbacks[0]
					}
				}).then(function() {
					console.log('SENT FEEDBACK, REMAIN', $scope.feedbacks.length);
					$scope.feedbacks.shift(); // remove sent element
					localStorage.feedbacks = JSON.stringify($scope.feedbacks);
					$scope.feedback_promise = null;
					$timeout($scope.feedback_worker, 1000);
				}, function(err) {
					console.error('FAILED FEEDBACK (will retry)', err);
					$scope.feedback_promise = null;
					$timeout($scope.feedback_worker, 5000);
				});
			};

			$scope.feedbacks = localStorage.feedbacks ?
				JSON.parse(localStorage.feedbacks) : [];
			$scope.feedback_worker();
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
				context: '=',
				notifyLayout: '='
			},
			controller: ['$scope', '$http', '$timeout', '$q', '$compile', '$rootScope', 'nb', 'nbUploadSrv', 'JobQueue',
				function($scope, $http, $timeout, $q, $compile, $rootScope, nb, nbUploadSrv, JobQueue) {
					$scope.human_size = $rootScope.human_size;
					$scope.nb = nb;
					$scope.nbUploadSrv = nbUploadSrv;

					$scope.go_up_level = go_up_level;
					$scope.has_parent = has_parent;
					$scope.folder_icon = folder_icon;
					$scope.is_selection_leader = is_selection_leader;
					$scope.num_selected = num_selected;
					$scope.open_inode = open_inode;
					$scope.toggle_preview = toggle_preview;
					$scope.download_inode = download_inode;
					$scope.rename_inode = rename_inode;
					$scope.delete_inodes = delete_inodes;
					$scope.new_folder = new_folder;
					$scope.move_inodes = move_inodes;
					$scope.copy_inode = copy_inode;
					$scope.share_inode = share_inode;

					$scope.expanded = true;
					$scope.notifyLayout = $scope.notifyLayout || angular.noop;

					$scope.selection = {
						items: [],
						source_index: function(i) {
							return $scope.current_inode.entries[i];
						}
					};

					$scope.select_inode = function(inode, $index, $event) {
						nb.select_item($scope.selection, inode, $index, $event);
						$scope.notifyLayout();
					};

					// console.log('BROWSER CONTEXT', $scope.context);
					set_current_inode($scope.context.current_inode);
					open_inode($scope.current_inode, 0, {});

					nbUploadSrv.notify_create_in_dir = function(dir_id) {
						if ($scope.current.id === dir_id) {
							open_inode($scope.current);
						}
					};

					function set_current_inode(dir_inode) {
						$scope.context.current_inode = dir_inode;
						$scope.current_inode = dir_inode;
						$scope.search_in_folder = '';
					}

					function go_up_level() {
						if ($scope.current_inode.level > 0) {
							set_current_inode($scope.current_inode.parent);
						}
					}

					function has_parent(dir_inode) {
						return dir_inode.level > 0;
					}

					function folder_icon(dir_inode) {
						return dir_inode.level > 0 ? 'fa-folder' : 'fa-folder-open'; // TODO PICK BETTER
					}

					function is_selection_leader(inode) {
						return $scope.selection.items[$scope.selection.items.length - 1] === inode;
					}

					function num_selected() {
						return $scope.selection.items.length;
					}

					function stop_event(event) {
						if (event.stopPropagation) {
							event.stopPropagation();
						}
						return false;
					}

					function open_inode(inode, $index, $event) {
						if (inode.isdir) {
							nb.reset_selection($scope.selection);
							nb.read_dir(inode).then($scope.notifyLayout);
							set_current_inode(inode);
						} else {
							if ((inode.is_selected && !inode.is_previewing) ||
								nb.select_item($scope.selection, inode, $index, $event)) {
								inode.is_previewing = true;
								if (!inode.content_type) {
									nb.read_file_attr(inode).then($scope.notifyLayout);
								}
							} else {
								inode.is_previewing = false;
							}
							$scope.notifyLayout();
							return stop_event($event);
						}
					}

					function toggle_preview(inode) {
						$scope.notifyLayout();
						inode.is_previewing = !inode.is_previewing;
						if (inode.is_previewing && !inode.content_type) {
							nb.read_file_attr(inode);
						}
					}

					function download_inode(inode) {
						var url = nb.inode_api_url(inode) + '?is_download=true';
						$('<iframe style="display: none">')[0].src = url;
						// var win = window.open(url, '_blank');
						// win.focus();
					}

					function rename_inode(inode) {
						if (!inode) {
							console.error('no selected inode, bailing');
							return;
						}
						if (nb.is_immutable_root(inode)) {
							$.nbalert('Cannot rename root folder');
							return;
						}
						if (nb.is_not_mine(inode)) {
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
								nb.read_dir(inode.parent);
								return res;
							}, function(err) {
								nb.read_dir(inode.parent);
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
						if (nb.is_not_mine(dir_inode) || dir_inode.owner_name) {
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
								nb.read_dir(dir_inode);
								return res;
							}, function(err) {
								nb.read_dir(dir_inode);
								throw err;
							});
						});
						dlg.nbdialog('open', {
							remove_on_close: true,
							modal: true
						});
					}

					function delete_inodes() {
						var selection = nb.selection_items($scope.selection); // copy array
						var read_dir_promises = new Array(selection.length);
						for (var i = 0; i < selection.length; i++) {
							var inode = selection[i];
							if (!inode) {
								console.error('no selected inode, bailing');
								return;
							}
							if (nb.is_immutable_root(inode)) {
								$.nbalert('Cannot delete root folder');
								return;
							}
							if (nb.is_not_mine(inode)) {
								$.nbalert('Cannot delete someone else\'s file ' + inode.name);
								return;
							}
							read_dir_promises[i] = inode.isdir ? nb.read_dir(inode) : $q.when(null);
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
								nb.recursive_delete($scope.selection.items, del_scope, function() {
									nb.read_dir($scope.current_inode);
									dlg.nbdialog('close');
									del_scope.$destroy();
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
						if (nb.is_immutable_root(inode)) {
							$.nbalert('Cannot copy root folder');
							return;
						}

						var copy_scope = $scope.$new();
						copy_scope.count = 0;
						copy_scope.concurrency = 0;
						copy_scope.max_concurrency = 32;

						// TODO OPEN FOLDER CHOOSER

						var on_copy = function() {
							nb.read_dir($scope.current_inode);
							var notify_message = 'Copy of ' + inode.name + ' is done. ';
							if (copy_scope.count !== 1) {
								notify_message += 'Copied ' + copy_scope.count + ' items. ';
							}
							$timeout(function() {
								$.bootstrapGrowl(notify_message, {
									type: 'success',
									align: 'right',
									width: 'auto',
								});
							}, 10);
						};
						return nb.recursive_copy(inode, copy_scope).then(on_copy, on_copy);
					}

					function share_inode(inode) {
						if (!inode) {
							console.error('no selected inode, bailing');
							return;
						}
						if (nb.is_immutable_root(inode)) {
							$.nbalert('Cannot share root folder');
							return;
						}
						if (nb.is_shared_with_me(inode)) {
							$.nbalert('Cannot share files in the "' + SWM + '" folder.<br/>' +
								'Use "Copy"...');
							return;
						}
						if (nb.is_not_mine(inode)) {
							$.nbalert('Cannot share someone else\'s file');
							return;
						}
						$('#share_modal').scope().open(inode);

					}

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
