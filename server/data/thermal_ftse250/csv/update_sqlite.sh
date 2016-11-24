cd ./python-yql-master/
python setup.py install

cd ../
python crawl.py --basedir=../sqlite/ --lastrun=lastrun.log