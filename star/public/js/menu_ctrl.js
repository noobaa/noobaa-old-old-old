////////////////////////////////
////////////////////////////////
// MenuBarCtrl
////////////////////////////////
////////////////////////////////

MenuBarCtrl.$inject = ['$scope', '$http', '$timeout', '$window'];

function MenuBarCtrl($scope, $http, $timeout, $window) {
	$scope.active_link = function(link) {
		return link === $window.location.pathname ? 'active' : '';
	};
	$scope.click_feedback = function() {
		$('#feedback_dialog').scope().open();
	};
}

////////////////////////////////
////////////////////////////////
// FeedbackCtrl
////////////////////////////////
////////////////////////////////

FeedbackCtrl.$inject = ['$scope', '$http', '$timeout'];

function FeedbackCtrl($scope, $http, $timeout) {

	var dlg = $('#feedback_dialog');
	dlg.nbdialog({
		modal: true,
		css: {
			width: 500
		}
	});

	$scope.open = function() {
		$scope.send_done = false;
		dlg.nbdialog('open');
	};

	$scope.send = function() {
		// add to persistent local storage, and return immediately
		// the worker will send in background
		$scope.feedbacks.push($scope.feedback);
		localStorage.feedbacks = JSON.stringify($scope.feedbacks);
		$scope.send_done = true;
		$scope.feedback = '';
		$scope.worker();
	};

	$scope.worker = function() {
		if ($scope.sending) {
			return;
		}
		if (!$scope.feedbacks.length) {
			return;
		}
		console.log('sending feedback.', 'queue:', $scope.feedbacks.length);
		$scope.sending = $http({
			method: 'POST',
			url: '/star_api/user/feedback/',
			data: {
				feedback: $scope.feedbacks[0]
			}
		}).success(function() {
			console.log('send feedback success.', 'queue:', $scope.feedbacks.length);
			$scope.feedbacks.shift(); // remove sent element
			localStorage.feedbacks = JSON.stringify($scope.feedbacks);
			$scope.sending = null;
			$timeout($scope.worker, 1000);
		}).error(function(data, status) {
			console.error('failed feedback.', 'status:', status, 'data:', data);
			$scope.sending = null;
			$timeout($scope.worker, 5000);
		});
	};

	$scope.feedbacks = localStorage.feedbacks ?
		JSON.parse(localStorage.feedbacks) : [];
	$scope.worker();
}

////////////////////////////////
////////////////////////////////
// UserCtrl
////////////////////////////////
////////////////////////////////

UserCtrl.$inject = ['$scope', '$http', '$timeout'];

function UserCtrl($scope, $http, $timeout) {
	$scope.user_quota = 0;
	$scope.user_usage = 0;

	function cancel_usage_refresh() {
		$timeout.cancel($scope.usage_refresh_timeout);
		delete $scope.usage_refresh_timeout;
	}

	function usage_refresh() {
		cancel_usage_refresh();
		$http({
			method: "GET",
			url: "/star_api/user/",
		}).success(function(data, status, headers, config) {
			$scope.user_quota = data.quota;
			$scope.user_usage = data.usage;
			cancel_usage_refresh();
			$scope.usage_refresh_timeout =
				$timeout(usage_refresh, 30000);
		}).error(function(data, status, headers, config) {
			console.log("Error in querying user usage: ", status);
			cancel_usage_refresh();
			$scope.usage_refresh_timeout =
				$timeout(usage_refresh, 30000);
		});
	}
	usage_refresh();
}



////////////////////////////////
////////////////////////////////
// GuideCtrl
////////////////////////////////
////////////////////////////////


var global_menu_bar_first_guide;
var global_menu_bar_last_guide;

GuideCtrl.$inject = ['$scope'];

function GuideCtrl($scope) {

	function guide_template(i, step) {
		var fin = (i + 1) === step.guide.steps.length;
		return [
			'<div class="popover tour">',
			'  <div class="arrow"></div>',
			'  <div class="popover-title fntmd"></div>',
			'  <div class="popover-content fntmd"></div>',
			'  <div class="popover-navigation text-center">',
			'    <span class="pull-left">',
			'      <span>', (i + 1), '/', step.guide.steps.length, '</span>',
			'    </span>',
			'    <span class="pull-right">',
			'      <button data-role="first" class="btn btn-default btn-xs"',
			'        onclick="global_menu_bar_first_guide()">',
			'        <i class="icon-repeat"></i></button>',
			'      <button data-role="end" class="btn btn-default btn-xs">',
			'        <i class="icon-remove"></i></button>',
			'    </span>',
			'    <span>',
			'      <button data-role="prev" class="btn btn-default btn-xs">Prev</button>',
			fin ? 
			'      <button data-role="end" class="btn btn-info btn-xs">Done</button>' :
			'      <button data-role="next" class="btn btn-primary btn-xs">Next</button>',
			'    </span>',
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
			path: '/mydata',
			backdrop: true,
			orphan: true,
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
				if (me.tour._current >= me.completed_steps ||
					me.tour._current+1 >= me.steps.length) {
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
		// console.log(this);
		if (!this.tour.ended() && !$scope.running_guide) {
			if (this.was_started || auto_start) {
				this.run();
			}
		}
	};

	Guide.prototype.is_completed = function() {
		// TODO: for now just check for tour end, but this is where we want 
		// to check for more complex conditions - such as did the user really share, etc
		return this.completed_steps === this.steps.length;
	};

	// since we update the number of steps in the tour
	// we need to make sure that current step is valid
	// otherwise even goto() will fail (onHide on undefined step).
	Guide.prototype.valid_step = function() {
		var i = this.tour._current;
		if (typeof i !== 'number' || i < 0 || i >= this.steps.length) {
			console.log('resetting invalid tour step', i, this.name);
			i = this.tour._current = 0;
		}
		return i;
	};

	Guide.prototype.run = function() {
		// we want to implement "pause" so we keep
		// and restore the step number, otherwise restart will clear it.
		var i = this.valid_step();
		if (this.tour.ended()) {
			// when the tour ended, only restart can redeem it
			this.tour.restart();
		} else {
			this.tour.start();
		}
		this.tour.goto(i);
	};

	global_menu_bar_first_guide = function() {
		if ($scope.running_guide && !$scope.running_guide.tour.ended()) {
			$scope.running_guide.valid_step();
			$scope.running_guide.tour.goto(0);
		}
		$scope.safe_apply();
	};
	global_menu_bar_last_guide = function() {
		if ($scope.running_guide && !$scope.running_guide.tour.ended()) {
			$scope.running_guide.valid_step();
			$scope.running_guide.tour.goto($scope.running_guide.steps.length - 1);
		}
		$scope.safe_apply();
	};

	// define guides in order
	$scope.guides_list = [
		new Guide('welcome', 'Welcome'),
		new Guide('upload_file', 'Uploading'),
		new Guide('access_file', 'Accessing'),
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

	$scope.guides.welcome.steps.push({
		title: 'WELCOME TO NOOBAA',
		content: [
			'<p>Use NooBaa for <b>extreme media files!</b></p>',
			'<p>Unlike Dropbox it is <b>FREE</b> for any capacity!',
			'  The Crowd makes it so...</p>'
		].join('\n')
	});

	$scope.guides.welcome.steps.push({
		element: '#upload_button',
		placement: 'bottom',
		title: 'UPLOAD',
		content: [
			'<p>Use the upload button',
			'<a class="btn btn-success" href="#"><i class="icon-cloud-upload icon-large"></i></a>',
			'  to upload files to your account.</p>',
			'<p>They will remain private until you share them.</p>',
		].join('\n')
	});

	$scope.guides.welcome.steps.push({
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
	});
	$scope.guides.welcome.steps_ready(true);


	//// UPLOAD FILE ////

	function advance_on_upload_modal_show(tour) {
		// advance to next step once the upload modal is shown
		$('#upload_modal').on('nbdialog_open.upload_guide', function() {
			tour.next();
		});
	}

	function done_advance_on_upload_modal_show(tour) {
		// remove the event we registered in onShow
		$('#upload_modal').off('nbdialog_open.upload_guide');
	}

	$scope.guides.upload_file.steps.push({
		title: 'UPLOAD',
		content: [
			'<p>This guide will show you how to upload using:</p>',
			'<ul class="nav">',
			'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>Drag & Drop</p></li>',
			'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>File Chooser</p></li>',
			'</ul>'
		].join('\n'),
	});

	$scope.guides.upload_file.steps.push({
		element: '#upload_button',
		placement: 'bottom',
		title: 'DRAG & DROP',
		content: [
			'<p>Drag a file and drop it <b>anywhere</b> in the NooBaa window.</p>',
			'<p>This will immediately start uploading.</p>',
			'<p>Try it now or click next to continue...</p>',
		].join('\n'),
		onShow: advance_on_upload_modal_show,
		onHide: done_advance_on_upload_modal_show
	});

	$scope.guides.upload_file.steps.push({
		element: '#upload_button',
		placement: 'bottom',
		title: 'UPLOADING',
		content: [
			'<p>Alrighty then!</p>',
			'<p>The upload dialog keeps your upload\'s progress.',
			'<p>You can always get back to it using the upload button',
			'  <a class="btn btn-success" href="#"><i class="icon-cloud-upload icon-large"></i></a>.',
			'  It will also open whenever you drop files to upload.'
		].join('\n')
	});

	$scope.guides.upload_file.steps.push({
		element: '#upload_button',
		placement: 'bottom',
		title: 'USING FILE CHOOSER',
		content: [
			'<p>In the upload dialod use the "Choose Files" button to select files to upload.</p>'
		].join('\n')
	});

	$scope.guides.upload_file.steps.push({
		element: '#upload_button',
		placement: 'bottom',
		title: 'USING FODLER CHOOSER',
		content: [
			'<p>Folder upload is supported on some browsers (e.g. Chrome, Safari).</p>',
			'<p>Use the "Choose Folders" button to select a folder to upload.</p>',
			'<p>The entire folder content will be uploaded.</p>',
		].join('\n')
	});

	$scope.guides.upload_file.steps.push({
		element: '#upload_button',
		placement: 'bottom',
		title: 'WHERE IS IT?',
		content: [
			'<p>Upload are added to your account',
			'  into the folder that is selected when the upload starts.',
			'<p>You should see your uploads listed in the current folder.</p>',
		].join('\n')
	});

	$scope.guides.upload_file.steps.push({
		title: 'DONE',
		content: [
			'<p>Well Done! You are a now a master of uploads!</p>',
			'<p>Check out more guides using',
			'  <i class="icon-info-sign text-info"></i></p>',
		].join('\n')
	});
	$scope.guides.upload_file.steps_ready();

	// ACCESS FILE ////

	$scope.guides.access_file.steps.push({
		title: 'ACCESSING',
		content: [
			'<p>This guide will show you how to open your files and browse your directories:</p>',
			'<ul class="nav">',
			'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>Opening a file and directory</p></li>',
			'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>The folder content area</p></li>',
			'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>The folders tree</p></li>',
			'</ul>'
		].join('\n')
	});

	$scope.guides.access_file.steps.push({
		element: '#open_button',
		placement: 'bottom',
		title: 'THE PLAY BUTTON',
		content: [
			'<p><a class="btn btn-default toolbtn" href="#"><i class="icon-play icon-large"></i></a>',
			' is used to open files and directories.</p>',
			'<ul >',
			'   <li><p>Select the file or folder and press the play button to open it.</p></li>',
			'   <li><p>When using a mouse, double-click a file or folder to open it.</p></li>',
			'</ul>',

		].join('\n')
	});

	$scope.guides.access_file.steps.push({
		element: '#inodes_list',
		placement: 'right auto',
		title: 'THE FOLDER CONTENT AREA',
		content: [
			'<p>Shows the files and folders within the currently selected folder.</p>',
			'<p>Open a file using the play button, or double click on the file\'s line. </p>',
			'<p>Drag and drop files here to upload.</p>',
			'<p>Drag and drop files from here to other folders to move them.</p>',
		].join('\n')
	});

	$scope.guides.access_file.steps.push({
		element: '#inodes_tree',
		placement: 'right auto',
		title: 'THE FOLDERS TREE',
		content: [
			'<p>	The currently selected folder is marked in the folder tree, and it\'s content is displayed in the content area.</p>',
			'<p>	Open a folder using the play button or double-click on it. </p>',
		].join('\n')
	});

	$scope.guides.access_file.steps_ready();


	//// SHARE FILE ////

	$scope.guides.share_file.steps.push({
		element: "#share_button",
		placement: 'bottom',
		title: "THE SHARING BUTTON",
		content: [
			'<p><a class="btn btn-default toolbtn" href="#"><i class="icon-share icon-large"></i></a> Allows you to share a file or folder. </p>',
			'<p> You can select whom you\'d like to share with from your Facebook friends.</p>',
		].join('\n ')
	});

	$scope.guides.share_file.steps.push({
		element: "#share_button",
		placement: 'bottom',
		title: "THE SHARING BUTTON",
		content: [
			'<p> In addition you can create a link. The link allows everybody who has it, to access the file. </p>',
			'<p> You can revoke the link, making the file inaccessible with that link.</p> ',
		].join('\n ')
	});

	$scope.guides.share_file.steps.push({
		element: "#share_button",
		placement: 'bottom',
		title: "THE SHARING BUTTON",
		content: [
			'<p> The <i class="icon-share icon-large"></i> indication is provided for any shared file in the folder content view, so you can always tell who can read your files.</p>',
		].join('\n ')
	});

	$scope.guides.share_file.steps.push({
		element: "#share_button",
		placement: 'bottom',
		title: "PRIVACY",
		content: [
			'<p> In NooBaa every file is private until you share it. </p>',
			'<p> Notice that sharing a folder shares all files under it, including files you\'ll add to that folder after the sharing. </p>',
		].join('\n')
	});

	$scope.guides.share_file.steps.push({
		element: "#share_button",
		placement: 'bottom',
		title: "SHARING IS FREE",
		content: [
			'<p> Sharing is free in every aspect. </p>',
			'<p> It doesn\'t cost you anything and it doesn\'t add any sort of charge or quota usage to your friends. </p>',
		].join('\n')
	});

	$scope.guides.share_file.steps_ready();

	// SHARED WITH ME //

	$scope.guides.shared_with_me.steps.push({
		element: "#inodes_tree",
		placement: 'right auto',
		title: "THE 'SHARED WITH ME' FOLDER",
		content: [
			'<p> In Noobaa there are two basic folders:</p>',
			'<ul class="nav">',
			'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>My data</p></li>',
			'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>Shared with me</p></li>',
			'</ul>'
		].join('\n')
	});

	$scope.guides.shared_with_me.steps.push({
		element: "#inodes_tree",
		placement: 'right auto',
		title: "THE 'SHARED WITH ME' FOLDER",
		content: [
			'<p> The \'Shared With Me\' folder points all to files your friends shared with you.</p>',
			'<p> Each of the files in this folder will show who shared it with you.</p>',
		].join('\n')
	});

	$scope.guides.shared_with_me.steps.push({
		element: "#inodes_tree",
		placement: 'right auto',
		title: "THE 'SHARED WITH ME' FOLDER",
		content: [
			'<p> As one can share only with his Facebook friends spamming is not an option.</p>',
			'<p> Well... except for that friends you\'re not sure why you have on you friends list...</p>',
		].join('\n')
	});

	$scope.guides.shared_with_me.steps.push({
		element: "#inodes_tree",
		placement: 'right auto',
		title: "THE 'SHARED WITH ME' FOLDER",
		content: [
			'<p> Files will appear in the \'Shared With Me\' folder as long as they are shared with you.</p>',
			'<p> They don\'t take any of your capacity so don\'t worry about having a lot of huge files there</p>',
		].join('\n')
	});

	$scope.guides.shared_with_me.steps.push({
		element: "#inodes_tree",
		placement: 'right auto',
		title: "THE 'SHARED WITH ME' FOLDER",
		content: [
			'<p> As you are not the owner of the file, it can be removed by the owner at any point.</p>',
			'<p> If you think you might be interested in viewing this file later, just copy it to your account.</p>',
		].join('\n')
	});


	$scope.guides.shared_with_me.steps_ready();

	//// CO SHARING ////

	$scope.guides.cosharing.steps.push({
		path: "/settings",
		title: "DON'T PANIC",
		content: [
			'<p>This is your account settings page.</p>',
			'<p>To get back to your files choose ',
			'MY DATA from the main toolbar</p>',
		].join('\n')
	});

	$scope.guides.cosharing.steps.push({
		path: "/settings",
		title: "CO-SHARING",
		content: [
			'<p>Co-sharing is the key to gain access to unlimited fast cloud storage.</p>',
			'<p>Co-sharing enables NooBaa to convert local hard drive resources into cloud resources.</p>',
		].join('\n')
	});

	$scope.guides.cosharing.steps.push({
		path: "/settings",
		title: "REQUIREMENTS",
		content: [
			'<p>In order to co-share all you will need is a Computer ',
			'connected to the Internet with some underutilized storage.</p>',
		].join('\n')
	});

	$scope.guides.cosharing.steps.push({
		path: "/settings",
		title: "COSTS",
		content: [
			'<p>FREE for any capacity.</p>',
			'<p>FREE for any number of files.</p>',
			'<p>FREE for unlimited sharing.</p>',
		].join('\n')
	});

	$scope.guides.cosharing.steps.push({
		path: "/settings",
		element: "#dl",
		placement: 'top',
		title: "STEP 1/3",
		content: [
			'<p>Download the NooBaa client for your OS.</p>',
			'<p>(we are working with the Chrome team to resolve the warning)</p>'
		].join('\n')
	});

	$scope.guides.cosharing.steps.push({
		path: "/settings",
		title: "STEP 2/3",
		content: [
			'<p>Run the installer.</p>',
			'<p>When the program starts, login to your Facebook account.',
		].join('\n')
	});

	$scope.guides.cosharing.steps.push({
		path: "/settings",
		title: "STEP 3/3",
		content: [
			'<p>Choose how much quota you\'d like to get on the cloud - ',
			'NooBaa will preallocate the same amount of storage on your hard drive. </p>',
		].join('\n')
	});

	$scope.guides.cosharing.steps.push({
		path: "/settings",
		element: "#devs",
		placement: 'bottom',
		title: "First device added",
		content: [
			'<p>Once your device is up and running, you can view your device in the device list.</p>',
			'<p>Enjoy the power of NooBaa\'s crowd-cloud!</p>',
		].join('\n')
	});

	$scope.guides.cosharing.steps_ready();
}