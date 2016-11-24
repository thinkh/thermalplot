'''
Created on 09.10.2014

@author: Holger Stitz
'''

import os, sys
import tornado
import tornado.escape
import tornado.ioloop
from tornado.options import define, options, parse_config_file
import tornado.options
import tornado.web

import ujson

import usecases.default
from usecases.default import log
import usecases.update

import ConfigParser

# override defined default options and CLI arguments with values from config file
# Usage: python main.py -environment=OverridenByConfig -config=env.config.conf
define("config", default="", type=str, help="path to global config file", callback=lambda path: parse_config_file(path, final=False))

# Change this to '0.0.0.0' to access the server from outside, otherwise use 127.0.0.1
define("environment", default="dev", help="environment")
define("host", default="0.0.0.0", help="run on the given ip address")
define("port", default=8888, help="run on the given port", type=int)
define("pathname", default="", help="working directory of the tornado (with trailing slash!)")

define("dev_client_dir", default="../client/app/", help="relative path to the client dir")
define("dist_client_dir", default="./html", help="relative path to the client dir")
define("usecases_dir", default="./data/", help="relative path to the use cases data dir")
define("usecases_config", default="usecase_config.json", help="filename to the default usecase configuration")

define("exec_dir", default=os.path.abspath(os.path.dirname(__file__)), help="relative path to the client dir")

define("disable_usecases_list", default=False, help="should the list of all_use_cases be disabled for security reasons?", type=bool)

class Application(tornado.web.Application):
    def __init__(self):

        handlers = [
            (r"/"+options.pathname+"debug", DebugOptionsHandler),
            (r"/"+options.pathname+"all_clients", ListAllClientsHandler),
            (r"/"+options.pathname+"all_use_cases", ListAllUseCasesHandler),
            (r"/"+options.pathname+"version", VersionHandler),

            # use cases start with /uc/...
            (r"/"+options.pathname+"uc/(.*)/socket", usecases.default.UseCaseSocketHandler),
            (r"/"+options.pathname+"uc/(.*)/static_data/(.*)", usecases.default.UseCaseStaticDataHandler),
            (r"/"+options.pathname+"uc/(.*)", usecases.default.UseCaseConfigHandler),
            (r"/"+options.pathname+"uc/(.*)/", usecases.default.UseCaseConfigHandler)
        ]

        handlers.extend(self.import_py_usecase_files(handlers))

        settings = dict(
            cookie_secret="zexM7szM5OCZUXzypuOJ",
            # client_path=os.path.join(os.path.dirname(__file__), "templates"),
            # static_path=os.path.join(os.path.dirname(__file__), "static"),
            # xsrf_cookies=True,

            debug=True,
            autoescape=None,
        )

        # DISTRIBUTION mode
        if options.environment == 'dist':
            print 'distribution env'
            settings['client_path'] = options.dist_client_dir
            settings['debug']=False
            settings['log_function']=self.log_request
            print os.getcwd(), os.path.abspath(settings['client_path'])

            handlers.extend([
                (r"/"+options.pathname+"(.*)", MyStaticFileHandler, {'path': settings['client_path'], 'default_filename': 'index.html'}),
            ])

        # DEBUG mode
        else:
            #settings['client_path'] = os.path.join(os.path.dirname(__file__), options.client_dir)
            settings['client_path'] = os.path.join(options.dev_client_dir, options.pathname)

            handlers.extend([
                (r"/update", usecases.update.UpdateServerHandler),
                (r"/restart",  usecases.update.RestartServerHandler)
            ])
            # if tornado should use a directory in the url, but the domain root should still provide a list of all clients in debug mode
            if options.pathname != "":
                handlers.extend([
                    (r"/all_clients", ListAllClientsHandler),
                    (r"/(.*)", MyStaticFileHandler, {'path': options.dev_client_dir, 'default_filename': 'index.html'})
                ])

            handlers.extend([
                # use compiled Sass stylesheets from .tmp directory
                #(r'/(.*/styles/.*\.css$)', StyleFileHandler, {'path': settings['client_path']}),
                (r"/"+options.pathname+"(.*)", MyStaticFileHandler, {'path': settings['client_path'], 'default_filename': 'index.html'})
            ])

        # Watch templates
        # for (path, dirs, files) in os.walk(settings["client_path"]):
        #    for item in files:
        #        tornado.autoreload.watch(os.path.join(path, item))

        #print>>sys.stderr, handlers

        tornado.web.Application.__init__(self, handlers, **settings)

    def log_request(self, request_handler):
        # disable output
        pass;

    def import_py_usecase_files(self, defaultHandlers):
        """
        Checks the use case directory for possible python modules to import
        Runs also the getHandlers() function from the imported file
        :param defaultHandlers:
        :return: Extended defaultHandlers for Tornado handlers
        """
        # add above directory to python's import path
        import os
        from os import sys
        import json
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), options.usecases_dir)))

        importedUsecases = []

        for dirname in os.listdir(options.usecases_dir):
            usecases_config = os.path.join(options.usecases_dir, dirname, options.usecases_config)

            if os.path.isdir(os.path.join(options.usecases_dir, dirname)) == True:

                if os.path.isfile(os.path.join(options.usecases_dir, dirname, '__init__.py')) == True:
                    #print>>sys.stderr, dirname
                    exec 'import ' + dirname
                    exec 'defaultHandlers = defaultHandlers + ' + dirname + '.getHandlers()'
                    #print>>sys.stderr, defaultHandlers
                    importedUsecases.append(dirname)

                elif os.path.isfile(usecases_config) == True:
                    json_data=open(usecases_config)
                    data = ujson.load(json_data)
                    json_data.close()

                    if 'usecaseBackend' in data and \
                        data['usecaseBackend'] != "" and \
                        data['usecaseBackend'] not in importedUsecases and \
                        os.path.isfile(os.path.join(options.usecases_dir, data['usecaseBackend'], '__init__.py')) == True:

                        exec 'import ' + data['usecaseBackend']
                        exec 'defaultHandlers = defaultHandlers + ' + data['usecaseBackend'] + '.getHandlers()'
                        #print>>sys.stderr, defaultHandlers
                        importedUsecases.append(data['usecaseBackend'])

                else:
                    print 'No python backend file for ' + dirname + ' found!'

        return defaultHandlers


class StyleFileHandler(tornado.web.StaticFileHandler):
    def set_extra_headers(self, path):
        # Disable cache
        self.set_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    # use compiled Sass stylesheets from .tmp directory
    def parse_url_path(self, url_path):
        # use compiled Sass stylesheets from .tmp directory for dev
        url_path = url_path.replace("app", ".tmp")
        return super(StyleFileHandler, self).parse_url_path(url_path)


class MyStaticFileHandler(tornado.web.StaticFileHandler):
    def set_extra_headers(self, path):
        # Disable cache
        self.set_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')


class ListAllClientsHandler(tornado.web.RequestHandler):
    def get(self):
        clients = []

        for dirname in os.listdir(options.dev_client_dir):
            if os.path.isdir(os.path.join(options.dev_client_dir, dirname)) == True:
                client = {
                    "name": dirname,
                    "isprovisioned": os.path.isfile(os.path.join(options.dev_client_dir, dirname, ".provisioned"))
                }
                clients.append(client)

        self.set_header('Content-Type', 'text/javascript')
        self.write(ujson.dumps(clients))


# get use cases from "data" sub-directories
class ListAllUseCasesHandler(tornado.web.RequestHandler):
    def get(self):
        cases = []
        all = self.get_argument("all", default="")
        if(options.disable_usecases_list == False or (options.disable_usecases_list == True and all == "1")):
            for dirname in os.listdir(options.usecases_dir):
                usecases_config = os.path.join(options.usecases_dir, dirname, options.usecases_config)
                if os.path.isdir(os.path.join(options.usecases_dir, dirname)) == True and os.path.isfile(usecases_config) == True:
                    json_data=open(usecases_config)
                    data = ujson.load(json_data)
                    json_data.close()
                    client = {
                        "name": dirname,
                        "title": data['title']
                    }
                    cases.append(client)

            cases.sort(key=lambda x: x['title'], reverse=False)
                
        self.set_header('Content-Type', 'text/javascript')
        self.write(ujson.dumps(cases))


# get use cases from python files
'''
class ListAllUseCasesHandler(tornado.web.RequestHandler):
    def get(self):
        cases = []
        for filename in os.listdir(options.usecases_dir):
            split = os.path.splitext(filename)
            if os.path.isfile(os.path.join(options.usecases_dir, filename)) == True and split[1] == ".py" and split[0] != "__init__":
                case = {
                    "name": split[0]
                }
                cases.append(case)

        self.set_header('Content-Type', 'text/javascript')
        self.write(ujson.dumps(cases))
'''

class VersionHandler(tornado.web.RequestHandler):
    def get(self):
        versions = dict()
        config_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '../version.cfg'))

        if os.path.isfile(config_file) == False:
            print(config_file + " does not exists!")

        else:
            config = ConfigParser.RawConfigParser()
            config.read(config_file)
            for section in config.sections():
                versions[section] = dict()
                for item in config.items(section):
                     versions[section][item[0]] = item[1]

        self.set_header('Content-Type', 'text/javascript')
        self.write(ujson.dumps(versions))
        
        
class DebugOptionsHandler(tornado.web.RequestHandler):
    def get(self):
        if options.environment == 'dist':
            self.write("Debug information are not available in distribution environment!")

        else:
            options_dict = dict()

            options_dict['environment'] = options.environment
            options_dict['host'] = options.host
            options_dict['port'] = options.port
            options_dict['pathname'] = options.pathname
            options_dict['dev_client_dir'] = options.dev_client_dir
            options_dict['dist_client_dir'] = options.dist_client_dir
            options_dict['usecases_dir'] = options.usecases_dir
            options_dict['usecases_config'] = options.usecases_config
            options_dict['exec_dir'] = options.exec_dir
            options_dict['disable_usecases_list'] = options.disable_usecases_list

            self.set_header('Content-Type', 'text/javascript')
            self.write(ujson.dumps(options_dict))


def main():
    tornado.options.parse_command_line()
    app = Application()
    app.listen(options.port, options.host)
    #tornado.ioloop.IOLoop.instance().start()
    io_loop = tornado.ioloop.IOLoop.instance()
    if options.environment == 'dev':
        tornado.autoreload.start(io_loop)
    io_loop.start()


if __name__ == "__main__":
    main()
