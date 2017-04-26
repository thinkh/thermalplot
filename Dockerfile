FROM python:2.7

MAINTAINER Samuel Gratzl <samuel.gratzl@datavisyn.io>


#RUN apt-get update && \
#    apt-get install -y software-properties-common && \
#    add-apt-repository ppa:git-core/ppa && \
#    apt-get update && \
#    apt-get install -y vim git-core curl python-dev python-pip && \
#    wget https://bootstrap.pypa.io/ez_setup.py -O - | python

RUN (curl -sL https://deb.nodesource.com/setup_6.x | bash - ) \
  && apt-get install -y nodejs

COPY ./server /var/server
COPY ./client /var/client
COPY ./vagrant /vagrant

RUN sh /vagrant/provision.sh false nostart

WORKDIR /var/server
CMD python main.py -config=env.vagrant_serve.conf
EXPOSE 8888
