import cv2
from chainer import cuda, Variable, serializers
from net import *
import numpy as np

RUN_ON_GPU = True
WIDTH=200
HEIGHT=200

model = FastStyleNet()

def _transform(in_image,loaded,m_path):
    if m_path == 'none':
        return in_image
    if not loaded:
        serializers.load_npz(m_path, model)
        if RUN_ON_GPU:
            cuda.get_device(0).use() #assuming only one core
            model.to_gpu()
        print "loaded"

    xp = np if not RUN_ON_GPU else cuda.cupy

    image = xp.asarray(in_image, dtype=xp.float32).transpose(2, 0, 1)
    image = image.reshape((1,) + image.shape)
    image -= 120

    x = Variable(image)
    y = model(x)

    result = cuda.to_cpu(y.data)
    result = result.transpose(0, 2, 3, 1)
    result = result.reshape((result.shape[1:]))
    result += 120
    result = np.uint8(result)

    return result

########################################################################################

import os
from PIL import Image

# Based on https://gist.github.com/BigglesZX/4016539 



def analyseImage(im):
    '''
    Pre-process pass over the image to determine the mode (full or additive).
    Necessary as assessing single frames isn't reliable. Need to know the mode
    before processing all frames.
    '''
    results = {
        'size': im.size,
        'mode': 'full',
    }
    try:
        while True:
            if im.tile:
                tile = im.tile[0]
                update_region = tile[1]
                update_region_dimensions = update_region[2:]
                if update_region_dimensions != im.size:
                    results['mode'] = 'partial'
                    break
            im.seek(im.tell() + 1)
    except EOFError:
        pass
    im.seek(0)
    return results


def getFrames(im):
    '''
    Iterate the GIF, extracting each frame.
    '''
    mode = analyseImage(im)['mode']

    p = im.getpalette()
    last_frame = im.convert('RGBA')

    try:
        while True:
            '''
            If the GIF uses local colour tables, each frame will have its own palette.
            If not, we need to apply the global palette to the new frame.
            '''
            if not im.getpalette():
                im.putpalette(p)

            new_frame = Image.new('RGBA', im.size)

            '''
            Is this file a "partial"-mode GIF where frames update a region of a different size to the entire image?
            If so, we need to construct the new frame by pasting it on top of the preceding frames.
            '''
            if mode == 'partial':
                new_frame.paste(last_frame)

            new_frame.paste(im, (0,0), im.convert('RGBA'))
            yield new_frame

            last_frame = new_frame
            im.seek(im.tell() + 1)
    except EOFError:
        pass


def processImage(gifPath, modelPath, outputPath):
    im = Image.open(gifPath)
    loaded = False
    for (i, frame) in enumerate(getFrames(im)):
        print("Processing %s frame %d, %s %s" % (path, i, im.size, im.tile))
        frame = cv2.resize(_transform(frame, loaded, modelPath), (0,0), fx=1.0, fy=1.00)
        im = Image.fromarray(frame)
        im.save(outputPath + str(i))
        loaded = True


def main():
    gifPath = sys.argv[1] 
    modelPath = sys.argv[2] 
    outputPath = sys.argv[3]
    processImage(gifPath, modelPath, outputPath)





