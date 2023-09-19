FROM --platform=linux/amd64 public.ecr.aws/ubuntu/ubuntu:22.04_stable
# more versions can be found at https://gallery.ecr.aws/ubuntu/ubuntu
USER root

RUN \
# Update
apt-get update -y && \
# Install Unzip
apt-get install unzip -y && \
# need wget
apt-get install wget -y && \
# git
apt-get install git -y && \
# curl
apt-get -y install curl && \
## jq
apt-get -y install jq && \
# python3
apt-get install python3 -y && \
# python3-pip
apt-get install python3-pip -y

# update python3
RUN python3 -m pip install --upgrade pip

# install terraform 
# more versions can be found at https://releases.hashicorp.com/terraform/
RUN wget https://releases.hashicorp.com/terraform/1.6.0-beta1/terraform_1.6.0-beta1_linux_amd64.zip
RUN unzip terraform_1.6.0-beta1_linux_amd64.zip
RUN mv terraform /usr/local/bin/

# install AWS CLI
RUN  pip3 install \
  awscli
