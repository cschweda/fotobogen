# Sample photos

`manifest.json` lists 25 photographs by their id at [Lorem Picsum](https://picsum.photos), with the size to request and a title, description, and alt text for each. **No image files are stored in this repository or in the Docker image.**

The photos are downloaded only when the site's admin asks for them:

- in the setup wizard, by choosing "Download 25 sample photos" (the default is to start empty);
- later, from the admin dashboard, with "Download sample photos";
- in a source checkout, with `pnpm seed:fetch`.

They go through the same pipeline as any upload and are marked as samples, so "Remove sample photos" deletes all of them, and only them, in one action.

## Licence and credit

Lorem Picsum serves photographs from [Unsplash](https://unsplash.com). They are published under the [Unsplash License](https://unsplash.com/license), not under this project's MIT licence, and are meant here as placeholders to be replaced with your own work. When a sample is downloaded, Fotobogen looks up its photographer at Lorem Picsum and adds "Photo by … on Unsplash" to the photo's description.

## The mix of shapes

10 landscape (3:2), 6 portrait (2:3), 4 square, 3 panoramic (3:1), and 2 very tall, so both grid layouts have something awkward to deal with. The long edge is at most 2560 px.
