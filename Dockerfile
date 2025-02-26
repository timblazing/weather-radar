FROM nginx:alpine

# Copy files to the Nginx default directory
COPY . /usr/share/nginx/html/

# Remove the default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Create a new configuration file
RUN echo 'server { \
    listen 80; \
    server_name blasinga.me; \
    location /weather-radar { \
        alias /usr/share/nginx/html/; \
        try_files $uri $uri/ /weather-radar/index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf
