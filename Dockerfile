FROM nginx:alpine

# Copy files to the Nginx default directory
COPY . /usr/share/nginx/html/

# Remove the default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    location / { \
        root /usr/share/nginx/html; \
        try_files $uri $uri/ =404; \
    } \
}' > /etc/nginx/conf.d/default.conf
