# Arrange a Music Studio session

1. In the project's **Audio Library**, upload a private audio file. Under **Music session**, open the session and choose the library file. Adding it decodes a waveform and creates a full-length region.
2. Edit each region's source start and end, place it on the timeline, and set fades. Regions on the same track cannot overlap.
3. Set each track's volume, mute or solo. **Preview session mix** plays the arrangement in the browser with level headroom. Editing stops the preview.
4. Under **Session lyrics**, add a section and optionally set its start and end on the session timeline. It highlights during playback. This text is separate from the main song sheet.
5. **Save music session** preserves the arrangement and lyrics. Reload to see the saved session, and choose **Load waveform** if you need to inspect a source again.

A session supports up to four mono or stereo sources of at most 12 MiB and five minutes each, four regions per track, and a ten-minute timeline. Preview needs a browser that can decode the source. Removing a session track leaves its original file in the Audio Library. Deleting a source in the library makes it unavailable to the session; remove the missing reference before saving. Preview is not a WAV or MP3 export.

Apply the Alembic migrations before opening these editors against an existing database. The new migrations add the sequence history and music session tables; downgrading removes those records.
