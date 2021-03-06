#!/usr/bin/env node
'use strict'; // eslint-disable-line strict
let files;

require( 'babel-register' );

/**
 * External dependencies
 */
const debug = require( 'debug' )( 'test-runner' ),
	glob = require( 'glob' ),
	Mocha = require( 'mocha' ),
	path = require( 'path' ),
	program = require( 'commander' ),
	chalk = require( 'chalk' );

const { configure } = require( 'enzyme' );
const Adapter = require( 'enzyme-adapter-react-16' );

configure( { adapter: new Adapter() } );

const { JSDOM } = require( 'jsdom' );

program
	.usage( '[options] [files]' )
	.option( '-R, --reporter <name>', 'specify the reporter to use', 'spec' )
	.option( '-t, --node-total <n>', 'specify the node total to use', parseInt )
	.option( '-i, --node-index <n>', 'specify the node index to use', parseInt )
	.option( '-g, --grep <pattern>', 'only run tests matching <pattern>' );

program.name = 'runner';

program.parse( process.argv );

const mocha = new Mocha( {
	ui: 'bdd',
	reporter: program.reporter,
} );

if ( program.grep ) {
	mocha.grep( new RegExp( program.grep ) );
}

if ( process.env.CIRCLECI ) {
	debug( 'Hello Circle!' );
	// give circle more time by default because containers are slow
	// why 10 seconds? a guess.
	mocha.suite.timeout( 10000 );
}

files = program.args.length ? program.args : [ process.env.TEST_ROOT ];
files = files.reduce( ( memo, filePath ) => {
	// Validate test root matches specified file paths
	if ( ! filePath.startsWith( process.env.TEST_ROOT ) ) {
		console.warn(
			chalk.red.bold( 'WARNING:' ),
			chalk.yellow( 'Invalid argument passed to test runner. Paths must match test root `' + process.env.TEST_ROOT + '`.' )
		);
		console.warn( ' - ' + filePath + '\n' );

		return memo;
	}

	// Append individual file argument
	if ( /\.jsx?$/i.test( filePath ) ) {
		return memo.concat( filePath );
	}

	// Look for files called name.test.jsx? inside the given file path
	let globPattern = '*.@(js|jsx)';
	if ( ! /\/test\/?$/.test( filePath ) ) {
		globPattern = path.join( '**/test', globPattern );
	}

	// Append discovered files from glob result
	return memo.concat( glob.sync( path.join( filePath, globPattern ) ) );
}, [] );

if ( program.nodeTotal > 1 ) {
	files = files.filter( ( file, index ) => {
		return index % program.nodeTotal === program.nodeIndex;
	} );
}

files.forEach( function( file ) {
	mocha.addFile( path.resolve( __dirname, '../' + file ) );
} );

// Fake web environment
const jsdom = new JSDOM( '<!doctype html><html><body></body></html>' );
const { window } = jsdom;

function copyProps( src, target ) {
	const props = Object.getOwnPropertyNames( src )
		.filter( prop => typeof target[ prop ] === 'undefined' )
		.reduce( ( result, prop ) => ( {
			...result,
			[ prop ]: Object.getOwnPropertyDescriptor( src, prop ),
		} ), {} );
	Object.defineProperties( target, props );
}

global.window = window;
global.document = window.document;
global.navigator = {
	userAgent: 'node.js',
};
copyProps( window, global );

// App globals
global.SiteSettings = {
	endpoint: 'http://trunk.wordpress.dev/',
	nonce: 'nonce',
};
global.FoxhoundSettings = {
	user: 1,
	userDisplay: 'admin',
	frontPage: {
		page: false,
		blog: false,
	},
	URL: {
		base: 'http://trunk.wordpress.dev/',
		path: '/',
	},
	meta: {
		title: 'Foxhound',
		description: 'Just another WordPress site',
	},
};

mocha.run( function( failures ) {
	process.on( 'exit', function() {
		process.exit( failures ); //eslint-disable-line no-process-exit
	} );
} );
