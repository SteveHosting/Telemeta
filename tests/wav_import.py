#!/usr/bin/python
#
# Copyright (C) 2008 Parisson
# All rights reserved.
#
# This software is licensed as described in the file COPYING, which
# you should have received as part of this distribution. The terms
# are also available at http://svn.parisson.org/telemeta/TelemetaLicense.
#
# Author: Guillaume Pellerin <yomguy@parisson.com>
#
# usage example :
#
# $ python manage.py shell
# >>> from wav_import import TelemetaWavImport
# >>> id_string = 'BM.2006.002.001--25__01-0'
# >>> source_dir = '/home/momo/music/wav/CNRSMH_2006_002_GUYANE'
# >>> t = TelemetaWavImport(id_string, source_dir)
# >>> t.main()
#
# or :
#
# $ python manage.py shell
# >>> from wav_import import TelemetaWavImport
# >>> id_string = 'BM.2006.002.001--25__01-10'
# >>> source_dir = '/home/momo/music/wav/CNRSMH_2006_002_GUYANE'
# >>> source_file = 'CNRSMH_2006_002_001_10.wav'
# >>> t = TelemetaWavImport(id_string, source_dir, source_dir, source_file)
# >>> t.main()


import os
import sys
import shutil
import datetime
from django.core.management import setup_environ

class TelemetaWavImport:

    def __init__(self, id_string, source_dir, source_file=None):
        from telemeta.models import MediaItem
        self.item_media_root_dir = settings.MEDIA_ROOT + os.sep + 'items' + os.sep
        #self.item_media_relative_dir = 'items' + os.sep
        self.source_dir = source_dir
        self.source_files = os.listdir(self.source_dir)
        self.source_file = source_file
        self.item_list = MediaItem.objects.filter(id__startswith=id_string)
        self.collection_id = self.item_list[0].collection_id
        self.year = datetime.datetime.now().strftime("%Y")
        self.buffer_size = 0xFFFF
        #self.dest_relative_dir = self.item_media_relative_dir + self.year + os.sep + self.collection_id + os.sep
        self.dest_dir = self.item_media_root_dir + self.year + os.sep + self.collection_id + os.sep
        
    def copy_files(self)
        print self.dest_dir
        if not os.path.exists(self.dest_dir):
            os.makedirs(self.dest_dir)
        for file in self.source_files:
            if not os.path.exists(self.dest_root_dir + file):
                shutil.copy(self.source_dir + os.sep + file, self.dest_root_dir)
        
    def wav_import(self):
        if not self.source_file:
            self.files = os.listdir(self.dest_dir)
            self.files.sort()
        else:
            self.files = [self.source_file]
        print self.files
        
        i = 0
        if len(self.files) >= len(self.item_list):
            for item in self.item_list:
                #item = MediaItem.objects.get(id=object.id)
                print item.id + " : " + item.title + " : "
                f = open(self.files[i], 'r')
                for chunk in f.read(self.buffer_size):
                    if len(chunk) == 0:
                        break
                    else:
                        item.file.write(chunk)
                item.save()
                print item.file.name
                #item.file.write = unicode(self.dest_dir + self.files[i])
                i += 1
                
    def main(self):
        #self.copy_files()
        self.wav_import()


def print_usage(tool_name):
    print "Usage: "+tool_name+" <project_dir> <id_string> <source_dir> [<source_file>]"
    print "  project_dir: the directory of the Django project which hosts Telemeta"
    print "  id_string: the string to filter in the id table"
    print "  source_dir: the directory containing the wav files to include"
    print "  source_file: the wav file to include (optional)"

def run():
    if len(sys.argv) < 3:
        print_usage(os.path.basename(sys.argv[0]))
        sys.exit(1)
    else:
        project_dir = sys.argv[1]
        id_string = sys.argv[2]
        source_dir = sys.argv[3]
        source_file = None
        if len(sys.argv) == 5:
            source_file = sys.argv[4]
        #from django.conf import settings
        import settings
        sys.path.append(project_dir)
        setup_environ(settings)
        t = TelemetaWavImport(id_string, source_dir, source_file)
        t.main()
        
if __name__ == '__main__':
    run()
                