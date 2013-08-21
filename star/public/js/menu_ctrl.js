var global_menu_bar_first_guide;
var global_menu_bar_last_guide;

MenuBarCtrl.$inject = ['$scope', '$location'];

function MenuBarCtrl($scope, $location) {

	$scope.active_link = function(link) {
		return link === $location.path() ? 'active' : '';
	};

	function guide_template(i, step) {
		return [
			'<div class="popover tour" style="min-width: ' + (step.width || 400) + 'px">',
			'  <div class="arrow"></div>',
			'  <div class="popover-title fnttour"></div>',
			'  <div class="popover-content fnttour"></div>',
			'  <div class="popover-navigation fnttour text-center">',
			'    <span class="fnttour pull-left">', (i + 1), '/', step.guide.steps.length, '</span>',
			'    <a href="#" data-role="first" onclick="global_menu_bar_first_guide()">',
			'      <i class="icon-fast-backward icon-fixed-width"></i></a>',
			'    <a href="#" data-role="prev" class="btn btn-inverse">',
			'      <i class="icon-step-backward icon-2x icon-fixed-width text-info"></i></a>',
			'    <a href="#" data-role="next" class="btn btn-inverse">',
			'      <i class="icon-step-forward icon-2x icon-fixed-width text-info"></i></a>',
			'    <a href="#" data-role="last" onclick="global_menu_bar_last_guide()">',
			'      <i class="icon-fast-forward icon-fixed-width"></i></a>',
			'    <a href="#" data-role="end" class="pull-right">',
			'      <i class="icon-remove icon-large icon-fixed-width fntblk"></i></a>',
			'  </div>',
			'</div>'
		].join('\n');
	}

	function Guide(name, title) {
		var me = this;
		// name is used to identify this tour in the local storage,
		// so when modified it will suddenly popup for users.
		this.name = name;
		// the title property is used by us when presenting the list of guides
		this.title = title;
		this.steps = [];
		this.completed_steps = parseInt(localStorage[name + '_completed_steps'], 10) || 0;
		this.was_started = localStorage[name + '_was_started'] === 'true';
		this.tour = new Tour({
			name: name,
			debug: true,
			template: guide_template,
			onStart: function() {
				if (!me.was_started) {
					me.was_started = true;
					localStorage[name + '_was_started'] = 'true';
				}
				if ($scope.running_guide) {
					$scope.running_guide.tour.end();
				}
				$scope.running_guide = me;
				$scope.safe_apply();
			},
			onEnd: function() {
				if (me.tour._current >= me.completed_steps) {
					// mark persistent completion when new step is reached
					me.completed_steps = me.tour._current + 1;
					localStorage[name + '_completed_steps'] = me.completed_steps;
				}
				$scope.running_guide = null;
				$scope.safe_apply();
			}
		});
	}

	// called after the steps array is full and ready.
	// it should remain unchanged once it is called.
	Guide.prototype.steps_ready = function(auto_start) {
		var me = this;
		_.each(this.steps, function(step) {
			// link backwards. helpfull in the template function
			step.guide = me;
		});
		// add the steps array to the tour.
		this.tour.addSteps(this.steps);
		// handle redirections here - need to start the tour which did redirect
		// so we identify simply by the first that's not ended.
		console.log(this);
		if (!this.tour.ended() && !$scope.running_guide) {
			if (this.was_started || (!this.was_started && auto_start)) {
				this.tour.start();
			}
		}
	};

	Guide.prototype.is_completed = function() {
		// TODO: for now just check for tour end, but this is where we want 
		// to check for more complex conditions - such as did the user really share, etc
		return this.completed_steps === this.steps.length;
	};

	Guide.prototype.run = function() {
		if (this.tour.ended()) {
			// when the tour ended, only restart can redeem it
			// but we want to implement "pause" so we keep
			// and restore the step number.
			var i = this.tour._current;
			this.tour.restart();
			this.tour.goto(i);
		} else {
			this.tour.start();
		}
	};

	global_menu_bar_first_guide = function() {
		console.log($scope.running_guide);
		if ($scope.running_guide) {
			$scope.running_guide.tour.goto(0);
		}
		$scope.safe_apply();
	};
	global_menu_bar_last_guide = function() {
		console.log($scope.running_guide);
		if ($scope.running_guide) {
			$scope.running_guide.tour.goto($scope.running_guide.steps.length - 1);
		}
		$scope.safe_apply();
	};

	// define guides in order
	$scope.guides_list = [
		new Guide('welcome', 'Welcome'),
		new Guide('upload_file', 'Uploading'),
		new Guide('open_file', 'Accessing'),
		new Guide('share_file', 'Sharing'),
		new Guide('shared_with_me', 'Shared with me'),
		new Guide('cosharing', 'Co-Sharing')
	];

	// also create map by name for easier access
	$scope.guides = {};
	_.each($scope.guides_list, function(guide) {
		$scope.guides[guide.name] = guide;
	});


	//// WELCOME ////

	$scope.guides.welcome.steps[0] = {
		element: '#logo_link',
		placement: 'bottom',
		path: '/mydata',
		backdrop: true,
		title: 'WELCOME TO NOOBAA',
		content: [
			'<p>Use NooBaa for <b>extreme media files!</b></p>',
			'<p>Unlike Dropbox it is <b>FREE</b> for any capacity!',
			'  The Crowd makes it so...</p>'
		].join('\n')
	};
	$scope.guides.welcome.steps[1] = {
		element: '#main-btn-group',
		placement: 'bottom',
		path: '/mydata',
		backdrop: true,
		title: 'UPLOAD',
		content: [
			'<p>Use the upload button',
			'<a class="btn btn-success" href="#"><i class="icon-cloud-upload icon-large"></i></a>',
			'  to upload files to your account.</p>',
			'<p>They will remain private until you share them.</p>',
		].join('\n')
	};
	$scope.guides.welcome.steps[2] = {
		element: '#menu_right',
		placement: 'bottom',
		path: '/mydata',
		backdrop: true,
		title: 'WHAT\'S NEXT',
		content: [
			// '<p>You have taken the first step in the way of the NooBaa!</p>',
			'<p>When you are ready to master <b>Sharing</b> and <b>Co-Sharing</b>, ',
			'  check out the guide button ',
			'  <i class="icon-info-sign text-info"></i></p>',
			'<p>Use the feedback button <i class="icon-comments text-info"></i>',
			'  frequently, it is very rewarding.</p>',
			// '<p>Have a good one!</p>',
			'<p class="text-right">- The NooBaa Team -</p>'
		].join('\n')
	};
	$scope.guides.welcome.steps_ready(true);


	//// UPLOAD FILE ////

	function advance_on_upload_modal_show(tour) {
		// advance to next step once the upload modal is shown
		$('#upload_modal').on('show.upload_guide', function() {
			tour.next();
		});
		$('#upload_modal').on('hide.upload_guide', function() {
			tour.next();
		});
	}

	function done_advance_on_upload_modal_show(tour) {
		// remove the event we registered in onShow
		$('#upload_modal').off('show.upload_guide');
		$('#upload_modal').off('hide.upload_guide');
	}

	function prepare_upload_modal(tour) {
		// must make visible immediately for the step element visibility
		$('#upload_modal').show();
	}

	$scope.upload_guide_uuid = 1;

	function modal_show_handler(modal, is_show) {
		return function(tour) {
			var m = $(modal);
			m.modal(is_show ? 'show' : 'hide');
			return {
				then: function(callback) {
					m.promise().done(function() {
						if (is_show === m.is(':visible')) {
							console.log('SHOWN MATCH');
							callback();
							return;
						}
						var ev = (is_show ? 'shown' : 'hidden') +
							'.upload_guide' + $scope.upload_guide_uuid;
						$scope.upload_guide_uuid++;
						console.log('PROMISE', ev);
						m.on(ev, function() {
							console.log('PROMISE DONE', ev);
							m.off(ev);
							callback();
						});
					});
				}
			};
		};
	}

	$scope.guides.upload_file.steps[0] = {
		element: '#main-btn-group',
		placement: 'bottom',
		path: '/mydata',
		backdrop: true,
		title: 'UPLOAD',
		content: [
			'<p>This guide will show you how to upload using:</p>',
			'<ul class="nav">',
			'  <li><p><i class="icon-bolt icon-li icon-fixed-width"></i>Drag & Drop</p></li>',
			'  <li><p><i class="icon-bolt icon-li icon-fixed-width"></i>File Chooser</p></li></ul>'
		].join('\n'),
	};
	$scope.guides.upload_file.steps[1] = {
		element: '#main-btn-group',
		placement: 'bottom',
		path: '/mydata',
		backdrop: true,
		title: 'DRAG & DROP',
		content: [
			'<p>Drag a file and drop it <b>anywhere</b> in the NooBaa window.</p>',
			'<p>This will immediately start uploading.</p>',
			'<p>Try it now...</p>',
		].join('\n'),
		onShow: advance_on_upload_modal_show,
		onHide: done_advance_on_upload_modal_show,
		onNext: prepare_upload_modal
	};
	$scope.guides.upload_file.steps[2] = {
		container: '#upload_modal',
		element: '#upload_table',
		placement: 'bottom',
		path: '/mydata',
		title: 'UPLOADING',
		width: 500,
		content: [
			'<p>Good job!</p>',
			'<p>This is the upload dialog which shows your upload\'s progress.',
			'<p>It will show whenever you drop files to upload, or press the upload button',
			'  <a class="btn btn-success" href="#"><i class="icon-cloud-upload icon-large"></i></a></p>',
			'<p>Upload are added to your account',
			'  into the folder that is chosen when the upload starts.',
		].join('\n'),
		onShow: modal_show_handler('#upload_modal', true),
		onPrev: modal_show_handler('#upload_modal', false),
	};
	$scope.guides.upload_file.steps[3] = {
		container: '#upload_modal',
		element: '#choose_file_button',
		placement: 'bottom',
		path: '/mydata',
		title: 'CHOOSE FILES',
		content: [
			'<p>Now let\'s use the file chooser.</p>',
			'<p>Pressing the "Choose Files" button will',
			'  open the chooser and will start uploading once you select a file.</p>',
			'<p>Try it now...</p>'
		].join('\n'),
		onShow: modal_show_handler('#upload_modal', true),
	};
	$scope.guides.upload_file.steps[4] = {
		container: '#upload_modal',
		element: '#choose_folder_button',
		placement: 'bottom',
		path: '/mydata',
		title: 'CHOOSE FILES',
		content: [
			'<p>Folder upload is supported in some browsers (e.g. Chrome, Safari).</p>',
			'<p>Pressing the "Choose Folders" button will',
			'  open the folder chooser and will upload the folder content.</p>',
			'<p>Try it now (or skip)...</p>'
		].join('\n'),
		onShow: modal_show_handler('#upload_modal', true),
		onNext: modal_show_handler('#upload_modal', false),
	};
	$scope.guides.upload_file.steps[5] = {
		element: '#inodes_list',
		placement: 'top',
		path: '/mydata',
		title: 'WHERE IS IT?',
		content: [
			'<p>Uploaded files will be found in the current folder.</p>',
		].join('\n'),
		onPrev: prepare_upload_modal
	};
	$scope.guides.upload_file.steps[6] = {
		element: '#menu_right',
		placement: 'bottom',
		path: '/mydata',
		backdrop: true,
		title: 'DONE',
		content: [
			'<p>You are a now a master of uploads!</p>',
			'<p>Check out more guides using <i class="icon-info-sign text-info"></i>.</p>',
		].join('\n'),
		onPrev: prepare_upload_modal
	};
	$scope.guides.upload_file.steps_ready();


	//// OPEN FILE ////

	$scope.guides.open_file.steps[0] = {
		element: "#my_guides",
		placement: 'bottom',
		backdrop: true,
		title: "",
		content: [
			'<p>OK, lets go.</p>'
		].join('\n')
	};
	$scope.guides.open_file.steps_ready();


	//// SHARE FILE ////

	$scope.guides.share_file.steps[0] = {
		element: "#my_guides",
		placement: 'bottom',
		backdrop: true,
		title: "",
		content: [
			'<p>OK, lets go.</p>'
		].join('\n')
	};
	$scope.guides.share_file.steps_ready();


	//// SHARED WITH ME ////

	$scope.guides.shared_with_me.steps[0] = {
		element: "#my_guides",
		placement: 'bottom',
		backdrop: true,
		title: "",
		content: [
			'<p>OK, lets go.</p>'
		].join('\n')
	};
	$scope.guides.shared_with_me.steps_ready();


	//// CO SHARING ////

	$scope.guides.cosharing.steps[0] = {
		element: "#my_guides", // jQuery selector
		placement: 'bottom',
		backdrop: true,
		title: "WELCOME TO NOOBAA !",
		content: [
			'<p>Hi. I am your tour guide.<br></p>',
			'<p>To re-take the tour just press',
			' the <i class="icon-info-sign text-info"></i> button</p><p> on the top bar</p>',
			// '<p>* You can also navigate this tour using the left & right arrow keys</p>',
			// '<p>* This tour is always available using the',
			// '<i class="icon-info-sign text-info"></i> button at the top</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[1] = {
		element: "#my_data_link",
		placement: 'bottom',
		backdrop: true,
		title: "MY DATA",
		content: [
			'<p>This is where you manage your files.</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[2] = {
		element: "#my_dev_link",
		placement: 'bottom',
		backdrop: true,
		title: "MY DEVICES",
		content: [
			'<p>This is where you manage your devices.</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[3] = {
		element: "#dl",
		placement: 'top',
		backdrop: true,
		path: "/mydevices",
		title: "Install Device",
		content: [
			'<p>Start co-sharing by installing your first device.</p>',
			'<p>Download the software, unzip and run.</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[4] = {
		element: "#devs",
		placement: 'bottom',
		backdrop: true,
		path: "/mydevices",
		title: "Connecting the Device",
		content: [
			'<p>When the application starts you will see the dashboard screen.</p>',
			'<p>Connect it with your facebook account.</p>',
			'<p>Once the connection is made, you should see your device listed here.</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[5] = {
		element: "#my_data_link",
		placement: 'bottom',
		backdrop: true,
		reflex: true,
		path: "/mydevices",
		title: "First device added",
		content: [
			'<p>Once your device is up and running,',
			'you are co-sharing and enjoying the power of NooBaa\'s crowd-cloud!</p>',
			'<p>Lets go to MY DATA and meet your data...</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[6] = {
		element: "#my_data_link",
		placement: 'bottom',
		path: "/mydata",
		title: "MY DATA",
		content: [
			'<p>Let\'s see how to manage your data...</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[7] = {
		element: "#inodes_tree",
		placement: 'right',
		path: "/mydata",
		title: "Accessing Data",
		content: [
			'<p>The two basic folder are "My Data" and "Shared with me".</p>',
			'<ui><li><strong>"My Data" </strong>holds all files that were uploaded by you.</li>',
			'<li><strong>"Shared with me"</strong> shows friends files that were shared with you.</li></ul>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[8] = {
		element: "#main-btn-group",
		placement: 'bottom',
		path: "/mydata",
		title: "Uploading, Consuming, Sharing",
		content: [
			'<p>This is an area that is very useful when you access your data via tablet.</p>',
			'<p>Just mark the line in the files list, and activate the required action on it.</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[9] = {
		element: "#my_guides", // jQuery selector
		placement: 'bottom',
		backdrop: true,
		title: "WELCOME TO NOOBAA !",
		content: [
			'<p>This is where the tour ends.</p>',
			'<p>Remember you can re-take the tour by pressing',
			' the <i class="icon-info-sign text-info"></i> button</p><p> on the top bar.</p>',
			'<p>Press the <strong>Close</strong> button or go back to any step by pressing the <strong>Prev</strong> button.</p>',
			// '<p>* You can also navigate this tour using the left & right arrow keys</p>',
			// '<p>* This tour is always available using the',
			// '<i class="icon-info-sign text-info"></i> button at the top</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps_ready();
}