
import 'file-loader?name=index.html!extract-loader!html-loader?interpolate!./index.html';
import 'file-loader?name=404.html-loader!./404.html';
import 'file-loader?name=robots.txt!./robots.txt';
import 'file-loader?name=favicon_32x32.png!./favicon_32x32.png';
import './style.scss';

import './scripts/app'