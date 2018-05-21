FROM python:2.7

MAINTAINER Samuel Gratzl <samuel.gratzl@datavisyn.io>

RUN pip install --upgrade pip

RUN (curl -sL https://deb.nodesource.com/setup_6.x | bash - ) \
  && apt-get install -y nodejs

COPY ./server /var/server
COPY ./client /var/client
COPY ./vagrant /vagrant

RUN sh /vagrant/provision.sh false nostart

WORKDIR /var/server
CMD python main.py -config=env.docker.conf
EXPOSE 8888
