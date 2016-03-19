'use strict';

var Git = require('git-exec');

function Commit(objectname, refnames) {
    this.objectname = objectname;
    this.refnames = refnames;
}

function Repository(path) {
    this.repo = new Git(path);
    this.getRefsHeads = function(callback) {
        this.repo.exec('for-each-ref', ['--format="%(objectname:short) %(refname:short) %(objecttype)"', 'refs/heads'], function(stderr, stdout) {
            var refnames = {};
            var lines = stdout.split('\n');

            for (var i = 0; i < lines.length; ++i) {
                var items = lines[i].split(' ');
                var objectname = items[0];
                var refname = items[1];
                var objecttype = items[2];

                if (objecttype == 'commit') {
                    if (objectname in refnames) {
                        refnames[objectname].push(refname);
                    } else {
                        refnames[objectname] = [refname];
                    }
                }
            }

            var commits = [];

            for (var objectname in refnames) {
                commits.push(new Commit(objectname, refnames[objectname]));
            }

            callback(commits);
        });
    };
}

exports.load_repository = function(path) {
    return new Repository(path);
}
