__author__ = 'Samuel Gratzl'

import tornado
import os
import sys
import subprocess
from tornado.options import options

class UpdateServerHandler(tornado.web.RequestHandler):
    def get(self):
        self.set_header('Content-Type', 'text/html')
        self.write('<!doctype html><html><head></head><body>')

        def writeSection(title, content):
            self.write('<h1>'+title+'</h1>')
            self.write('<pre>')
            self.write(tornado.escape.xhtml_escape(content))
            self.write('</pre>')
            self.flush()

        clientdir = os.path.abspath(os.path.join(options.dev_client_dir, '../'))
        self.write(clientdir)
        try:
            git_pull = subprocess.check_output('cd '+clientdir+' ; git pull', stderr=subprocess.STDOUT, shell=True)
            writeSection('git pull', git_pull)
        except subprocess.CalledProcessError, e:
            writeSection('git pull ERROR '+str(e.returncode), e.output)
        try:
            output = subprocess.check_output('cd '+clientdir+' ; npm install', stderr=subprocess.STDOUT, shell=True)
            writeSection('npm install', output)
        except subprocess.CalledProcessError, e:
            writeSection('npm install ERROR '+str(e.returncode), e.output)

        try:
            output = subprocess.check_output('cd '+clientdir+' ; bower install', stderr=subprocess.STDOUT, shell=True)
            writeSection('bower install', output)
        except subprocess.CalledProcessError, e:
            writeSection('bower install ERROR '+str(e.returncode), e.output)

        try:
            output = subprocess.check_output('cd '+clientdir+' ; grunt buildd --force', stderr=subprocess.STDOUT, shell=True)
            writeSection('grunt buildd --force', output)
        except subprocess.CalledProcessError, e:
            writeSection('grunt buildd --force ERROR '+str(e.returncode), e.output)

        try:
            output = subprocess.check_output('cd '+clientdir+' ; git checkout tsd.json', stderr=subprocess.STDOUT, shell=True)
            writeSection('git checkout tsd.json', output)
        except subprocess.CalledProcessError, e:
            writeSection('git pull ERROR '+str(e.returncode), e.output)


        self.write('</body></html>')


class RestartServerHandler(tornado.web.RequestHandler):
    def get(self):
        self.set_header('Content-Type', 'text/plain')
        self.write('bye bye')
        self.flush()
        self.finish()
        #FROM: http://www.tornadoweb.org/en/branch3.1/_modules/tornado/autoreload.html

        # sys.path fixes: see comments at top of file.  If sys.path[0] is an empty
        # string, we were (probably) invoked with -m and the effective path
        # is about to change on re-exec.  Add the current directory to $PYTHONPATH
        # to ensure that the new process sees the same path we did.
        path_prefix = '.' + os.pathsep
        if (sys.path[0] == '' and
                not os.environ.get('PYTHONPATH', '').startswith(path_prefix)):
            os.environ['PYTHONPATH'] = (path_prefix +
                                        os.environ.get('PYTHONPATH', ''))
        if sys.platform == 'win32':
            # os.execv is broken on Windows and can't properly parse command line
            # arguments and executable name if they contain whitespaces. subprocess
            # fixes that behavior.
            subprocess.Popen([sys.executable] + sys.argv)
            sys.exit(0)
        else:
            try:
                os.execv(sys.executable, [sys.executable] + sys.argv)
            except os.OSError:
                # Mac OS X versions prior to 10.6 do not support execv in
                # a process that contains multiple threads.  Instead of
                # re-executing in the current process, start a new one
                # and cause the current process to exit.  This isn't
                # ideal since the new process is detached from the parent
                # terminal and thus cannot easily be killed with ctrl-C,
                # but it's better than not being able to autoreload at
                # all.
                # Unfortunately the errno returned in this case does not
                # appear to be consistent, so we can't easily check for
                # this error specifically.
                os.spawnv(os.P_NOWAIT, sys.executable,
                          [sys.executable] + sys.argv)
                sys.exit(0)
