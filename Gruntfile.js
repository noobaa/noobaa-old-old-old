module.exports = function(grunt) {

	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		jshint: {
			all: [
				'Gruntfile.js',
				'star.js',
				'models/**/*.js',
				'routes/**/*.js',
				'providers/**/*.js',
				'public/noobaa/**/*.js',
				'planet/js/**/*.js'
			]
		}//,
		// uglify: {
		//	options: {
		//		banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
		//	},
		//	build: {
		//		src: 'src/<%= pkg.name %>.js',
		//		dest: 'build/<%= pkg.name %>.min.js'
		//	}
		// }
	});

	// Load the plugin that provides the "uglify" task.
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-jshint');

	// Default task(s).
	grunt.registerTask('default', [
		'jshint'//,
		// 'uglify'
	]);

};